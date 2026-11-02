"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { demoRoom, trackById, type RoomView } from "../model/catalog";
import { providerDefinition } from "../model/providers";
import type { RoomAction } from "../model/contracts";
import { roomRequest } from "../api/room-client";
import { errorMessage } from "@/shared/api/http-client";

export function useRoomSession(onJoinRequired: (code: string) => void) {
  const [room, setRoom] = useState<RoomView>(demoRoom);
  const [real, setReal] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(0);
  const fetchingRef = useRef(false);
  const mutationVersionRef = useRef(0);
  const me = room.members.find((m) => m.id === room.me);
  const isHost = me?.host ?? false;
  const live = real && room.mode === "live";
  const manual =
    live && providerDefinition(room.provider).control === "handoff";
  const lookup = (id: string | null) =>
    id ? room.tracks?.[id] || trackById(id) : undefined;
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
    localStorage.setItem("aux-room", data.code);
    history.replaceState(null, "", `/?room=${data.code}`);
  }, []);
  useEffect(() => {
    let stopped = false;
    // Restore browser-owned state after hydration without blocking the first paint.
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
      const code = params.get("room") || localStorage.getItem("aux-room");
      if (!code) {
        setReady(true);
        return;
      }
      roomRequest(`/api/rooms/${encodeURIComponent(code)}`)
        .then((data) => {
          if (!stopped) setActiveRoom(data);
        })
        .catch(() => {
          if (!stopped) {
            onJoinRequired(code);
            setReady(true);
          }
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
      } catch {
        if (!stopped) setOffline(true);
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
      if (real) {
        const data = await roomRequest(`/api/rooms/${room.code}`, "PATCH", a);
        setRoom(data);
        setOffline(false);
      } else {
        const next = structuredClone(room);
        if (a.type === "add") {
          if (next.queue.filter((q) => q.memberId === room.me).length >= 3)
            throw new Error("You have 3 songs queued. Give everyone a turn.");
          if (
            next.queue.some((q) => q.trackId === a.trackId) ||
            next.current === a.trackId
          )
            throw new Error("That song is already in the queue.");
          if (!next.current) next.current = a.trackId;
          else
            next.queue.push({
              id: crypto.randomUUID(),
              trackId: a.trackId,
              memberId: room.me,
              votes: [],
            });
        }
        if (a.type === "vote") {
          const item = next.queue.find((q) => q.id === a.itemId);
          if (!item) throw new Error("That request is no longer in the queue.");
          item.votes = item.votes.includes(room.me)
            ? item.votes.filter((id) => id !== room.me)
            : [...item.votes, room.me];
        }
        if (a.type === "remove")
          next.queue = next.queue.filter((q) => q.id !== a.itemId);
        if (a.type === "promote") {
          const index = next.queue.findIndex((q) => q.id === a.itemId);
          if (index < 0)
            throw new Error("That request is no longer in the queue.");
          const [item] = next.queue.splice(index, 1);
          if (item) next.queue.unshift(item);
        }
        if (a.type === "toggle") {
          if (!next.current) throw new Error("Add a song first.");
          next.position = elapsed;
          next.playing = !next.playing;
          next.startedAt = next.playing ? now : null;
        }
        if (a.type === "next") {
          next.current = next.queue.shift()?.trackId ?? null;
          next.position = 0;
          next.startedAt = next.playing ? now : null;
          if (!next.current) next.playing = false;
        }
        if (a.type === "lock") next.locked = !next.locked;
        if (a.type === "end") {
          next.ended = true;
          next.playing = false;
        }
        setRoom(next);
      }
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
    localStorage.removeItem("aux-room");
    history.replaceState(null, "", "/");
    setReal(false);
    setRoom(demoRoom());
  }
  return {
    room,
    real,
    ready,
    busy,
    offline,
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
