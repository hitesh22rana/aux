"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { emptyRoom, type RoomView } from "../model/room";
import { providerDefinition } from "../model/providers";
import type { RoomAction } from "../model/contracts";
import { roomRequest } from "../api/room-client";
import { errorMessage, HttpError } from "@/shared/api/http-client";

export function useRoomSession(onJoinRequired: (code: string) => void) {
  const [room, setRoom] = useState<RoomView>(emptyRoom);
  const [real, setReal] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [now, setNow] = useState(0);
  const fetchingRef = useRef(false);
  const mutationVersionRef = useRef(0);
  const me = room.members.find((m) => m.id === room.me);
  const isHost = me?.host ?? false;
  const live = real && room.mode === "live";
  const manual =
    live && providerDefinition(room.provider).control === "handoff";
  const lookup = (id: string | null) => (id ? room.tracks?.[id] : undefined);
  const current = lookup(room.current);
  const acceptPlayback = useCallback((data: RoomView) => {
    setRoom((previous) => (previous.code === data.code ? data : previous));
  }, []);
  const elapsed =
    room.position +
    (room.playing && room.startedAt
      ? Math.max(0, (now - room.startedAt) / 1000)
      : 0);
  const progress =
    current && current.duration > 0
      ? Math.min(100, (elapsed / current.duration) * 100)
      : 0;
  const setActiveRoom = useCallback((data: RoomView) => {
    setRoom(data);
    setReal(true);
    setReady(true);
    setEntryError("");
    history.replaceState(null, "", `/?room=${data.code}`);
  }, []);
  useEffect(() => {
    let stopped = false;
    // Only an explicit invitation URL restores a room; the home page always stays home.
    const bootstrap = window.setTimeout(() => {
      setNow(Date.now());
      const params = new URLSearchParams(location.search);
      if (params.get("spotify") === "connected")
        toast.success(
          "Spotify connected. Open the host’s player and start a song.",
        );
      if (params.get("spotify") === "error")
        toast.error(
          params.get("reason") ||
            "Spotify connection failed. Try connecting again.",
        );
      const code = params.get("room");
      if (!code) {
        setReady(true);
        return;
      }
      roomRequest(`/api/rooms/${encodeURIComponent(code)}`)
        .then((data) => {
          if (stopped) return;
          if (data.ended) {
            setEntryError(
              "This room has ended. Ask for a new invite or start a room.",
            );
            history.replaceState(null, "", "/");
            setReady(true);
            return;
          }
          setActiveRoom(data);
        })
        .catch((error: unknown) => {
          if (stopped) return;
          if (error instanceof HttpError && error.status === 401) {
            onJoinRequired(code);
          } else {
            setEntryError(
              error instanceof HttpError &&
                [400, 404, 410].includes(error.status)
                ? "This room is no longer available. Ask for a new invite or start a room."
                : "We couldn’t open this room. Try this link again in a moment.",
            );
            if (
              error instanceof HttpError &&
              [400, 404, 410].includes(error.status)
            )
              history.replaceState(null, "", "/");
          }
          setReady(true);
        });
    }, 0);
    return () => {
      stopped = true;
      window.clearTimeout(bootstrap);
    };
  }, [setActiveRoom, onJoinRequired]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!real || !ready || room.ended) return;
    let stopped = false;
    const refresh = async () => {
      if (document.hidden || fetchingRef.current) return;
      fetchingRef.current = true;
      const version = mutationVersionRef.current;
      try {
        const data = await roomRequest(`/api/rooms/${room.code}`);
        if (!stopped && version === mutationVersionRef.current) {
          setRoom(data);
          setOffline(false);
        }
      } catch (error: unknown) {
        if (!stopped) {
          if (error instanceof HttpError && error.status === 410) {
            setRoom((previous) => ({
              ...previous,
              ended: true,
              playing: false,
              startedAt: null,
            }));
            setOffline(false);
          } else setOffline(true);
        }
      } finally {
        fetchingRef.current = false;
      }
    };
    const id = setInterval(refresh, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [real, ready, room.code, room.ended]);
  async function action(a: RoomAction) {
    if (busy || room.ended) return;
    setBusy(true);
    mutationVersionRef.current++;
    try {
      if (!real) return;
      const data = await roomRequest(`/api/rooms/${room.code}`, "PATCH", a);
      setRoom(data);
      setOffline(false);
      if (a.type === "add") toast.success("Added to the shared queue");
      if (live && ["toggle", "next"].includes(a.type))
        toast("Command sent to Spotify. Updating playback shortly.");
      if (a.type === "remove") toast("Request removed");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      mutationVersionRef.current++;
      setBusy(false);
    }
  }
  function resetSession() {
    mutationVersionRef.current++;
    history.replaceState(null, "", "/");
    setReal(false);
    setRoom(emptyRoom());
    setOffline(false);
    setEntryError("");
  }
  return {
    room,
    real,
    ready,
    busy,
    offline,
    entryError,
    isHost,
    live,
    manual,
    current,
    elapsed,
    progress,
    lookup,
    acceptPlayback,
    setActiveRoom,
    action,
    resetSession,
  };
}
