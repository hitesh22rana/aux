"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Link2,
  RefreshCw,
  Unplug,
  Headphones,
} from "lucide-react";
import { toast } from "sonner";
import type { RoomView } from "@/lib/catalog";
export function SpotifyConnection({
  room,
  onSync,
}: {
  room: RoomView;
  onSync: (room: RoomView) => void;
}) {
  const host = room.members.some((m) => m.id === room.me && m.host);
  const [status, setStatus] = useState<{
    configured: boolean;
    connected: boolean;
    workerOnline?: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/rooms/${room.code}/spotify`;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setStatus(data);
        if (data.connected && host && !room.ended) {
          const sync = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "sync" }),
            signal,
          });
          const value = await sync.json();
          if (!sync.ok) throw new Error(value.error);
          onSync(value);
        }
        setError("");
      } catch (e) {
        if (!signal?.aborted)
          setError((e as Error).message || "Couldn’t reach Spotify.");
      }
    },
    [endpoint, host, onSync, room.ended],
  );
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const tick = async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        await refresh(controller.signal);
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(tick, 7000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  async function command(type: "connect" | "disconnect" | "recover" | "next") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        type === "next" ? `/api/rooms/${room.code}` : endpoint,
        {
          method: type === "next" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (type === "connect") {
        window.location.assign(data.url);
        return;
      }
      if (type === "disconnect") {
        setStatus((s) => (s ? { ...s, connected: false } : s));
        toast("Spotify disconnected. The Aux queue is kept.");
      } else {
        onSync(data);
        toast("Playback command saved for the worker.");
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const connected = status?.connected ?? room.playback?.connected;
  const device = room.playback?.device;
  return (
    <section className="spotify-connection" aria-label="Spotify connection">
      <div className="flex items-center justify-between gap-2">
        <h2>
          <Headphones size={17} />
          Spotify handles the sound.
        </h2>
        {connected && <span className="connection-dot" />}
      </div>
      <p>
        {connected
          ? device
            ? `Controlling ${device.name}`
            : "Open Spotify on the host’s phone and start a song."
          : host
            ? "Connect the host account. Your crew only needs Aux."
            : "Waiting for the host to connect Spotify."}
      </p>
      {status && !status.configured && host && (
        <div className="connection-setup">
          Spotify setup is needed on this server. Follow the README to add your
          app credentials.
        </div>
      )}
      {(error || room.playback?.error) && (
        <p className="connection-error" role="status">
          {error || room.playback?.error}
        </p>
      )}
      {room.orchestration && !room.orchestration.workerOnline && (
        <p className="connection-error" role="status">
          The playback worker is offline. Requests are saved; playback resumes
          when the worker is running.
        </p>
      )}
      <div className="connection-buttons">
        {host && connected && !room.ended && (
          <button
            className="button primary"
            disabled={busy || !room.orchestration?.workerOnline}
            onClick={() =>
              command(
                room.orchestration?.automatic
                  ? "next"
                  : room.orchestration?.uncertain ||
                      room.orchestration?.activeRequestId
                    ? "recover"
                    : "next",
              )
            }
          >
            {room.orchestration?.automatic
              ? "Play next in Aux"
              : "Start / resume Aux"}
          </button>
        )}
        {host && !connected && (
          <button
            className="button primary"
            disabled={busy || !status?.configured || room.ended}
            onClick={() => command("connect")}
          >
            <Link2 size={15} />
            {busy ? "Connecting…" : "Connect Spotify"}
          </button>
        )}
        {connected && (
          <>
            <a
              className="button secondary"
              href="https://open.spotify.com/"
              target="_blank"
              rel="noreferrer"
            >
              Open Spotify
              <ExternalLink size={13} />
            </a>
            {host && (
              <>
                <button
                  className="icon-button"
                  aria-label="Refresh Spotify player"
                  disabled={busy || room.ended}
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Disconnect Spotify"
                  disabled={busy}
                  onClick={() => command("disconnect")}
                >
                  <Unplug size={16} />
                </button>
              </>
            )}
          </>
        )}
      </div>
      <small>
        Aux owns the queue. Spotify plays one selected track at a time.
      </small>
    </section>
  );
}
