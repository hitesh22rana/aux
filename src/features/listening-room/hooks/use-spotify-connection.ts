"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";
import { requestJson, errorMessage } from "@/shared/api/http-client";
import { roomViewSchema, connectionStatusSchema } from "../model/contracts";
import type { RoomView } from "../model/contracts";
const connectResponseSchema = v.object({ url: v.pipe(v.string(), v.url()) });
const disconnectResponseSchema = v.object({ connected: v.literal(false) });
export function useSpotifyConnection(
  room: RoomView,
  onSync: (room: RoomView) => void,
) {
  const host = room.members.some((m) => m.id === room.me && m.host);
  const [status, setStatus] = useState<v.InferOutput<
    typeof connectionStatusSchema
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/rooms/${room.code}/spotify`;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await requestJson(endpoint, connectionStatusSchema, {
          signal,
        });
        setStatus(data);
        if (data.connected && host && !room.ended) {
          const value = await requestJson(endpoint, roomViewSchema, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "sync" }),
            signal,
          });
          onSync(value);
        }
        setError("");
      } catch (e) {
        if (!signal?.aborted)
          setError(errorMessage(e) || "Couldn’t reach Spotify.");
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
      const options = { method: "POST", body: JSON.stringify({ type }) };
      if (type === "connect") {
        const data = await requestJson(
          endpoint,
          connectResponseSchema,
          options,
        );
        window.location.assign(data.url);
        return;
      }
      if (type === "disconnect") {
        await requestJson(endpoint, disconnectResponseSchema, options);
        setStatus((previous) =>
          previous ? { ...previous, connected: false } : previous,
        );
        toast("Spotify disconnected. The Aux queue is kept.");
      } else {
        const data = await requestJson(
          type === "next" ? `/api/rooms/${room.code}` : endpoint,
          roomViewSchema,
          { ...options, method: type === "next" ? "PATCH" : "POST" },
        );
        onSync(data);
        toast("Playback command saved for the worker.");
      }
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const connected = status?.connected ?? room.playback?.connected;
  const device = room.playback?.device;
  return { host, status, error, busy, command, refresh, connected, device };
}
