import "server-only";
import { identify, readRoom, save, mutate, type Action } from "./store";
import { RoomError } from "./errors";
import { providerDefinition } from "./providers";
import { spotify } from "./playback/spotify";
import { disconnect, hasConnection } from "./spotify-storage";
import { changeQueue, addToQueue, liveView, queueControl } from "./live-queue";
import type { Member } from "./catalog";
const locks = new Map<string, Promise<unknown>>();
export async function inRoom<T>(
  code: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(code) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(work);
  locks.set(code, task);
  try {
    return await task;
  } finally {
    if (locks.get(code) === task) locks.delete(code);
  }
}
export function authorizeLive(
  code: string,
  token: string | undefined,
  host = false,
) {
  const member = identify(code, token);
  const room = readRoom(code);
  if (room.mode !== "live")
    throw new RoomError(
      "This is a demo room. Start a live room to manage playback.",
      409,
    );
  if (room.ended) throw new RoomError("This ride has ended.", 410);
  if (host && !member.host)
    throw new RoomError("Only the host can control the player.", 403);
  return { room, member };
}
export function authorizeSpotify(
  code: string,
  token: string | undefined,
  host = false,
) {
  const context = authorizeLive(code, token, host);
  if (context.room.provider !== "Spotify")
    throw new RoomError(
      "This room uses host-led handoff, not Spotify remote control.",
      409,
    );
  return context;
}
export async function syncPlayer(code: string, token: string | undefined) {
  const { room, member } = authorizeSpotify(code, token, true);
  await changeQueue(room, () => {}, "refresh");
  return liveView(room, member.id);
}
export async function liveCommand(
  code: string,
  token: string | undefined,
  action: Action,
) {
  const { room, member } = authorizeLive(code, token);
  if (["lock", "end"].includes(action.type)) {
    if (!member.host) throw new RoomError("Only the host can do that.", 403);
    if (action.type === "end") {
      await changeQueue(
        room,
        (state) => {
          state.ended = true;
          state.automation = false;
          state.controls = [];
          delete state.handoff;
        },
        "ended",
      );
      disconnect(code);
    }
    const updated = mutate(code, token, action);
    return liveView(updated, member.id);
  }
  if (action.type === "toggle" || action.type === "next") {
    if (providerDefinition(room.provider).control !== "remote")
      throw new RoomError(
        "Open a selected request in the music app, then confirm playback in Aux.",
        409,
      );
    if (!member.host)
      throw new RoomError("Only the host can control the player.", 403);
    if (!hasConnection(code))
      throw new RoomError("Connect Spotify first.", 409);
    await queueControl(room, action.type);
    return liveView(room, member.id);
  }
  if (action.type === "add")
    throw new RoomError("Search Spotify to add a track.", 400);
  if (!("itemId" in action))
    throw new RoomError("Unsupported queue action.", 400);
  await changeQueue(
    room,
    (state) => {
      if (state.ended) throw new RoomError("This ride has ended.", 410);
      const item = state.queue.find((q) => q.id === action.itemId);
      if (!item) throw new RoomError("This song is no longer queued.", 404);
      if (action.type === "vote") {
        item.votes = item.votes.includes(member.id)
          ? item.votes.filter((id) => id !== member.id)
          : [...item.votes, member.id];
        return;
      }
      if (
        state.operation?.item?.id === item.id ||
        (state.handoff?.itemId === item.id &&
          state.handoff.expiresAt > Date.now())
      )
        throw new RoomError(
          "That song is being handed to the player. Wait for confirmation.",
          409,
        );
      if (action.type === "remove") {
        if (!member.host && item.memberId !== member.id)
          throw new RoomError("You can only remove your own requests.", 403);
        state.queue = state.queue.filter((q) => q.id !== item.id);
      } else {
        if (!member.host)
          throw new RoomError("Only the host can reorder the queue.", 403);
        state.queue = state.queue.filter((q) => q.id !== item.id);
        state.queue.unshift(item);
      }
    },
    action.type,
  );
  return liveView(readRoom(code), member.id);
}
export async function requestTrack(
  code: string,
  token: string | undefined,
  uri: string,
  requestId: string,
) {
  const { room, member } = authorizeSpotify(code, token);
  if (room.locked && !member.host)
    throw new RoomError("Requests are paused by the host.", 403);
  if (!hasConnection(code))
    throw new RoomError("The host needs to connect Spotify first.", 409);
  const track = await spotify.track(code, uri.split(":")[2]);
  const latest = authorizeLive(code, token).room;
  if (latest.locked && !member.host)
    throw new RoomError("Requests are paused by the host.", 403);
  await addToQueue(latest, member.id, track, requestId);
  return liveView(readRoom(code), member.id);
}
export async function recoverQueue(code: string, token: string | undefined) {
  const { room, member } = authorizeSpotify(code, token, true);
  await queueControl(room, "recover");
  return liveView(room, member.id);
}
const searches = new Map<
  string,
  { until: number; tracks: Awaited<ReturnType<typeof spotify.search>> }
>();
const searchTimes = new Map<string, number>();
export async function searchTracks(
  code: string,
  token: string | undefined,
  query: string,
) {
  authorizeSpotify(code, token);
  const key = `${code}:${query.toLowerCase()}`;
  const cached = searches.get(key);
  if (cached && cached.until > Date.now()) return cached.tracks;
  const last = searchTimes.get(code) || 0;
  if (Date.now() - last < 350)
    throw new RoomError("Give the search a moment, then try again.", 429);
  searchTimes.set(code, Date.now());
  const tracks = await spotify.search(code, query);
  if (searches.size > 200) searches.clear();
  searches.set(key, { until: Date.now() + 30000, tracks });
  return tracks;
}
export function connectionView(code: string, member: Member) {
  const room = readRoom(code);
  return {
    connected: hasConnection(code),
    host: member.host,
    ended: room.ended,
  };
}
export async function disconnectRoom(code: string, token: string | undefined) {
  const { room } = authorizeSpotify(code, token, true);
  await changeQueue(
    room,
    (state) => {
      state.automation = false;
      state.controls = [];
      state.playback = { connected: false, device: null, syncedAt: Date.now() };
      state.playing = false;
      state.startedAt = null;
    },
    "disconnected",
  );
  disconnect(code);
  save(readRoom(code));
}
