import * as v from "valibot";
import { roomCodeSchema } from "./form-schemas";
import { providers } from "@/features/listening-room/model/providers";

export const trackSchema = v.object({
  id: v.string(),
  title: v.string(),
  artist: v.string(),
  album: v.string(),
  duration: v.pipe(v.number(), v.finite(), v.minValue(0)),
  art: v.string(),
  mood: v.string(),
  provider: v.picklist(providers),
  url: v.optional(v.string()),
});
export const memberSchema = v.object({
  id: v.string(),
  name: v.string(),
  color: v.string(),
  host: v.boolean(),
  active: v.optional(v.boolean()),
  connections: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  leftAt: v.optional(v.number()),
});
export const queueItemSchema = v.object({
  id: v.string(),
  trackId: v.string(),
  memberId: v.string(),
  votes: v.array(v.string()),
  delivery: v.optional(v.picklist(["sending", "sent", "failed", "uncertain"])),
  deliveryMessage: v.optional(v.string()),
});
export const playbackStatusSchema = v.object({
  connected: v.boolean(),
  device: v.nullable(
    v.object({ id: v.string(), name: v.string(), restricted: v.boolean() }),
  ),
  syncedAt: v.number(),
  error: v.optional(v.string()),
});
export const roomSchema = v.object({
  mode: v.literal("live"),
  tracks: v.optional(v.record(v.string(), trackSchema)),
  playback: v.optional(playbackStatusSchema),
  code: v.string(),
  name: v.string(),
  provider: v.picklist(providers),
  members: v.array(memberSchema),
  queue: v.array(queueItemSchema),
  current: v.nullable(v.string()),
  playing: v.boolean(),
  position: v.pipe(v.number(), v.finite(), v.minValue(0)),
  startedAt: v.nullable(v.number()),
  locked: v.boolean(),
  ended: v.boolean(),
  createdAt: v.number(),
});
export const roomViewSchema = v.object({
  ...roomSchema.entries,

  me: v.string(),

  orchestration: v.optional(
    v.object({
      workerOnline: v.boolean(),
      automatic: v.boolean(),
      uncertain: v.boolean(),
      activeRequestId: v.optional(v.string()),
      inFlightId: v.optional(v.string()),
      control: v.optional(v.picklist(["remote", "handoff"])),
      handoff: v.optional(
        v.object({ id: v.string(), itemId: v.string(), expiresAt: v.number() }),
      ),
      hostConfirmed: v.optional(v.boolean()),
    }),
  ),
});
export const roomActionSchema = v.variant("type", [
  v.strictObject({
    type: v.literal("kick"),
    memberId: v.pipe(v.string(), v.regex(/^[a-f0-9]{24}$/)),
  }),
  v.strictObject({
    type: v.literal("add"),
    trackId: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  }),
  v.strictObject({
    type: v.picklist(["vote", "remove", "promote"]),
    itemId: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  }),
  v.strictObject({ type: v.picklist(["toggle", "next", "lock", "end"]) }),
]);
export const searchResultsSchema = v.object({ tracks: v.array(trackSchema) });
export const connectionStatusSchema = v.object({
  configured: v.boolean(),
  connected: v.boolean(),
  workerOnline: v.optional(v.boolean()),
});
export type Track = v.InferOutput<typeof trackSchema>;
export type Member = v.InferOutput<typeof memberSchema>;
export type QueueItem = v.InferOutput<typeof queueItemSchema>;
export type PlaybackStatus = v.InferOutput<typeof playbackStatusSchema>;
export type Room = v.InferOutput<typeof roomSchema>;
export type RoomView = v.InferOutput<typeof roomViewSchema>;
export type RoomAction = v.InferOutput<typeof roomActionSchema>;

export const sessionsSchema = v.object({
  sessions: v.array(
    v.object({
      code: roomCodeSchema,
      name: v.string(),
      provider: v.picklist(providers),
      host: v.boolean(),
      expiresAt: v.number(),
    }),
  ),
});
export type SavedSession = v.InferOutput<
  typeof sessionsSchema
>["sessions"][number];
