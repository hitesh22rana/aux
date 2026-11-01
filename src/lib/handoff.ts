import "server-only";
import { randomUUID } from "node:crypto";
import { RoomError } from "./errors";
import { authorizeLive } from "./orchestrator";
import { addToQueue, changeQueue, liveView } from "./live-queue";
import { parseTrackLink, providerDefinition } from "./providers";
import type { Track } from "./catalog";
function context(code: string, token: string | undefined, host = false) {
  const c = authorizeLive(code, token, host);
  if (providerDefinition(c.room.provider).control !== "handoff")
    throw new RoomError(
      "This room uses automatic Spotify playback. Search its connected catalog instead.",
      409,
    );
  return c;
}
export async function requestLinkedTrack(
  code: string,
  token: string | undefined,
  input: { url: string; title: string; artist: string; requestId: string },
) {
  const { room, member } = context(code, token);
  if (room.locked && !member.host)
    throw new RoomError("Requests are paused by the host.", 403);
  const link = parseTrackLink(input.url);
  if (!link)
    throw new RoomError(
      "Use a full song link from a supported music service. Short links, albums, and playlists are not accepted.",
      422,
    );
  if (link.provider !== room.provider)
    throw new RoomError(
      `This room plays through ${room.provider}. Share a song link from that service.`,
      422,
    );
  const track: Track = {
    id: link.id,
    title: input.title.trim(),
    artist: input.artist.trim() || "Added by the crew",
    album: "Shared song link",
    duration: 0,
    art: "placeholder",
    mood: "Shared request",
    provider: link.provider,
    url: link.url,
  };
  await addToQueue(room, member.id, track, input.requestId);
  return liveView(room, member.id);
}
export async function prepareHandoff(
  code: string,
  token: string | undefined,
  itemId?: string,
) {
  const { room, member } = context(code, token, true);
  const result = await changeQueue(
    room,
    (state) => {
      if (state.ended) throw new RoomError("This session has ended.", 410);
      if (state.handoff && state.handoff.expiresAt > Date.now()) {
        if (itemId && itemId !== state.handoff.itemId)
          throw new RoomError(
            "Confirm or cancel the current selection first.",
            409,
          );
        return state.handoff;
      }
      const item = itemId
        ? state.queue.find((q) => q.id === itemId)
        : state.queue[0];
      if (!item) throw new RoomError("Add a request first.", 409);
      const track = state.tracks[item.trackId];
      const link = track?.url && parseTrackLink(track.url);
      if (!link || link.provider !== room.provider || link.id !== track.id)
        throw new RoomError(
          "This request no longer has a valid track link.",
          422,
        );
      state.handoff = {
        id: randomUUID(),
        itemId: item.id,
        expiresAt: Date.now() + 600000,
      };
      return state.handoff;
    },
    "handoff.prepared",
  );
  return { room: await liveView(room, member.id), selection: result.value };
}
export async function confirmHandoff(
  code: string,
  token: string | undefined,
  id: string,
) {
  const { room, member } = context(code, token, true);
  await changeQueue(
    room,
    (state) => {
      if (state.ended) throw new RoomError("This session has ended.", 410);
      if (state.lastConfirmedHandoff === id) return;
      const pending = state.handoff;
      if (!pending || pending.id !== id || pending.expiresAt < Date.now())
        throw new RoomError(
          "The selection expired or changed. Select a request again.",
          409,
        );
      const item = state.queue.find((q) => q.id === pending.itemId);
      if (!item)
        throw new RoomError("This request is no longer in the queue.", 409);
      state.queue = state.queue.filter((q) => q.id !== item.id);
      state.active = item;
      state.current = item.trackId;
      state.playing = false;
      state.position = 0;
      state.startedAt = null;
      state.automation = false;
      state.lastConfirmedHandoff = id;
      delete state.handoff;
      state.playback = { connected: false, device: null, syncedAt: Date.now() };
    },
    "handoff.confirmed",
  );
  return liveView(room, member.id);
}
export async function cancelHandoff(
  code: string,
  token: string | undefined,
  id: string,
) {
  const { room, member } = context(code, token, true);
  await changeQueue(
    room,
    (state) => {
      if (state.handoff?.id === id) delete state.handoff;
    },
    "handoff.cancelled",
  );
  return liveView(room, member.id);
}
export async function finishHandoff(code: string, token: string | undefined) {
  const { room, member } = context(code, token, true);
  await changeQueue(
    room,
    (state) => {
      if (state.handoff && state.handoff.expiresAt > Date.now())
        throw new RoomError(
          "Confirm or cancel the selected request first.",
          409,
        );
      delete state.active;
      delete state.handoff;
      state.current = null;
      state.playing = false;
      state.startedAt = null;
    },
    "handoff.finished",
  );
  return liveView(room, member.id);
}
