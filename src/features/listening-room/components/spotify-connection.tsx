"use client";
import {
  ExternalLink,
  Link2,
  RefreshCw,
  Unplug,
  Headphones,
} from "lucide-react";
import type { RoomView } from "../model/contracts";
import { useSpotifyConnection } from "../hooks/use-spotify-connection";
type ConnectionState = ReturnType<typeof useSpotifyConnection>;
export function SpotifyConnection({
  room,
  onSync,
}: {
  room: RoomView;
  onSync: (room: RoomView) => void;
}) {
  const { host, status, error, busy, command, refresh, connected, device } =
    useSpotifyConnection(room, onSync);
  return (
    <section className="spotify-connection" aria-label="Spotify connection">
      <div className="flex items-center justify-between gap-2">
        <h2>
          <Headphones size={17} />
          Spotify handles the sound.
        </h2>
        {connected && <span className="connection-dot" />}
      </div>
      <p>{connectionDescription(connected, device, host)}</p>
      <ConnectionNotices
        room={room}
        host={host}
        status={status}
        error={error}
      />
      <ConnectionActions
        room={room}
        host={host}
        status={status}
        busy={busy}
        command={command}
        refresh={refresh}
        connected={connected}
      />
      <small>
        Aux owns the queue. Spotify plays one selected track at a time.
      </small>
    </section>
  );
}

function connectionDescription(
  connected: ConnectionState["connected"],
  device: ConnectionState["device"],
  host: boolean,
): string {
  if (connected)
    return device
      ? `Controlling ${device.name}`
      : "Open Spotify on the host’s phone and start a song.";
  return host
    ? "Connect the host account. Your group only needs Aux."
    : "Waiting for the host to connect Spotify.";
}
function ConnectionNotices({
  room,
  host,
  status,
  error,
}: Pick<ConnectionState, "host" | "status" | "error"> & { room: RoomView }) {
  return (
    <>
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
    </>
  );
}
type ActionsProps = Pick<
  ConnectionState,
  "host" | "status" | "busy" | "command" | "refresh" | "connected"
> & { room: RoomView };
function ConnectionActions({
  room,
  host,
  status,
  busy,
  command,
  refresh,
  connected,
}: ActionsProps) {
  if (!connected)
    return host ? (
      <ConnectButton
        room={room}
        status={status}
        busy={busy}
        command={command}
      />
    ) : null;
  return (
    <div className="connection-buttons">
      {host && (
        <StartPlaybackButton room={room} busy={busy} command={command} />
      )}
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
        <HostControls
          room={room}
          busy={busy}
          command={command}
          refresh={refresh}
        />
      )}
    </div>
  );
}
function ConnectButton({
  room,
  status,
  busy,
  command,
}: Pick<ActionsProps, "room" | "status" | "busy" | "command">) {
  return (
    <div className="connection-buttons">
      <button
        className="button primary"
        disabled={busy || !status?.configured || room.ended}
        onClick={() => command("connect")}
      >
        <Link2 size={15} />
        {busy ? "Connecting…" : "Connect Spotify"}
      </button>
    </div>
  );
}
function resumeCommand(room: RoomView): "next" | "recover" {
  if (room.orchestration?.automatic) return "next";
  return room.orchestration?.uncertain || room.orchestration?.activeRequestId
    ? "recover"
    : "next";
}
function HostControls({
  room,
  busy,
  command,
  refresh,
}: Pick<ActionsProps, "room" | "busy" | "command" | "refresh">) {
  return (
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
  );
}

function StartPlaybackButton({
  room,
  busy,
  command,
}: Pick<ActionsProps, "room" | "busy" | "command">) {
  if (room.ended) return null;
  return (
    <button
      className="button primary"
      disabled={busy || !room.orchestration?.workerOnline}
      onClick={() => command(resumeCommand(room))}
    >
      {room.orchestration?.automatic
        ? "Play next in Aux"
        : "Start / resume Aux"}
    </button>
  );
}
