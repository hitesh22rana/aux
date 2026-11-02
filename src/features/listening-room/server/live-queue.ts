import "server-only";
import { randomUUID } from "node:crypto";
import { redis } from "@/server/redis/connection";
import { queueKeys } from "@/features/listening-room/server/queue-keys";
import { providerDefinition } from "@/features/listening-room/model/providers";
import { AppError } from "@/shared/lib/errors";
import type {
  Track,
  QueueItem,
  Room,
  PlaybackStatus,
  RoomView,
} from "@/features/listening-room/model/catalog";
export type Control = { id: string; type: "toggle" | "next" | "recover" };
export type Operation = {
  id: string;
  kind: "start" | "pause" | "resume";
  item?: QueueItem;
  commandId?: string;
  phase: "sending" | "confirming" | "uncertain";
  at: number;
};
export type LiveState = {
  version: number;
  queue: QueueItem[];
  tracks: Record<string, Track>;
  current: string | null;
  playing: boolean;
  position: number;
  startedAt: number | null;
  playback?: PlaybackStatus;
  active?: QueueItem;
  automation: boolean;
  operation?: Operation;
  controls: Control[];
  requests: Record<string, { member: string; uri: string }>;
  ended: boolean;
  expires: number;
  lastPlaying?: boolean;
  lastProgress?: number;
  lastSeen?: number;
  retryAt?: number;
  handoff?: { id: string; itemId: string; expiresAt: number };
  lastConfirmedHandoff?: string;
};
export function emptyState(room: Room): LiveState {
  return {
    version: 0,
    queue: [],
    tracks: {},
    current: null,
    playing: false,
    position: 0,
    startedAt: null,
    automation: false,
    controls: [],
    requests: {},
    ended: room.ended,
    expires: Math.floor((room.createdAt + 86400000) / 1000),
  };
}
export async function queueState(room: Room): Promise<LiveState> {
  const client = await redis();
  const raw = await client.get(queueKeys.state(room.code));
  return raw ? (JSON.parse(raw) as LiveState) : emptyState(room);
}
// Queue changes and their worker event are committed in the same Redis operation.
const cas = `local raw=redis.call('GET',KEYS[1]); local version=0; if raw then version=cjson.decode(raw).version end; if version~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EXAT',ARGV[3]); if ARGV[4]~='' then redis.call('XADD',KEYS[2],'*','room',ARGV[4],'kind',ARGV[5]); redis.call('ZADD',KEYS[3],ARGV[6],ARGV[4]); end; return 1`;
export async function changeQueue<T>(
  room: Room,
  modify: (state: LiveState) => T,
  wake = "changed",
): Promise<{ state: LiveState; value: T }> {
  const client = await redis();
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await queueState(room);
    const expected = state.version;
    const value = modify(state);
    state.version++;
    const changed = await client.eval(cas, {
      keys: [queueKeys.state(room.code), queueKeys.events, queueKeys.due],
      arguments: [
        String(expected),
        JSON.stringify(state),
        String(state.expires),
        wake ? room.code : "",
        wake,
        String(Date.now()),
      ],
    });
    if (Number(changed) === 1) return { state, value };
  }
  throw new AppError("The queue changed several times. Please try again.", 409);
}
export async function liveView(room: Room, me: string): Promise<RoomView> {
  const client = await redis();
  const [state, worker] = await Promise.all([
    queueState(room),
    client.exists(queueKeys.heartbeat),
  ]);
  return {
    ...room,
    queue: state.queue,
    tracks: state.tracks,
    current: state.current,
    playing: state.playing,
    position: state.position,
    startedAt: state.startedAt,
    playback: state.playback,
    orchestration: {
      workerOnline: !!worker,
      automatic: state.automation,
      uncertain: state.operation?.phase === "uncertain",
      activeRequestId: state.active?.id,
      inFlightId:
        state.operation?.item?.id ||
        (state.handoff && state.handoff.expiresAt > Date.now()
          ? state.handoff.itemId
          : undefined),
      control: providerDefinition(room.provider).control,
      handoff: state.handoff,
      hostConfirmed:
        providerDefinition(room.provider).control === "handoff" &&
        !!state.active,
    },
    me,
  };
}
export async function addToQueue(
  room: Room,
  member: string,
  track: Track,
  requestId: string,
) {
  await changeQueue(
    room,
    (state) => {
      if (state.ended) throw new AppError("This session has ended.", 410);
      const prior = state.requests[requestId];
      if (prior) {
        if (prior.member !== member || prior.uri !== track.id)
          throw new AppError("Request ID already used.", 409);
        return;
      }
      if (Object.keys(state.requests).length >= 1000)
        throw new AppError(
          "This session has reached its request limit. Start a new room.",
          409,
        );
      if (
        state.queue.some((q) => q.trackId === track.id) ||
        state.active?.trackId === track.id
      )
        throw new AppError("That song is already playing or queued.", 409);
      if (state.queue.filter((q) => q.memberId === member).length >= 3)
        throw new AppError(
          "You have 3 songs queued. Give everyone a turn.",
          409,
        );
      state.tracks[track.id] = track;
      state.queue.push({
        id: randomUUID(),
        trackId: track.id,
        memberId: member,
        votes: [],
      });
      state.requests[requestId] = { member, uri: track.id };
    },
    "requested",
  );
}
export async function queueControl(room: Room, type: Control["type"]) {
  await changeQueue(
    room,
    (state) => {
      if (state.ended) throw new AppError("This session has ended.", 410);
      if (type === "recover" && state.operation?.phase === "uncertain")
        state.controls = [];
      if (
        state.controls.length >= 1 ||
        (state.operation && state.operation.phase !== "uncertain")
      )
        throw new AppError(
          "Wait for the current player command to finish.",
          409,
        );
      if (state.operation?.phase === "uncertain" && type !== "recover")
        throw new AppError(
          "Check Spotify, then use Resume Aux to recover this queue.",
          409,
        );
      state.controls.push({ id: randomUUID(), type });
    },
    "control",
  );
}
