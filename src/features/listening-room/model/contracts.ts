import { z } from "zod";
import { providers } from "@/features/listening-room/model/providers";

export const trackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  duration: z.number().finite().nonnegative(),
  art: z.string(),
  mood: z.string(),
  provider: z.enum(providers),
  url: z.string().optional(),
});
export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  host: z.boolean(),
});
export const queueItemSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  memberId: z.string(),
  votes: z.array(z.string()),
  delivery: z.enum(["sending", "sent", "failed", "uncertain"]).optional(),
  deliveryMessage: z.string().optional(),
});
export const playbackStatusSchema = z.object({
  connected: z.boolean(),
  device: z
    .object({ id: z.string(), name: z.string(), restricted: z.boolean() })
    .nullable(),
  syncedAt: z.number(),
  error: z.string().optional(),
});
export const roomSchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
  tracks: z.record(z.string(), trackSchema).optional(),
  playback: playbackStatusSchema.optional(),
  code: z.string(),
  name: z.string(),
  provider: z.enum(providers),
  members: z.array(memberSchema),
  queue: z.array(queueItemSchema),
  current: z.string().nullable(),
  playing: z.boolean(),
  position: z.number().finite().nonnegative(),
  startedAt: z.number().nullable(),
  locked: z.boolean(),
  ended: z.boolean(),
  createdAt: z.number(),
});
export const roomViewSchema = roomSchema.extend({
  me: z.string(),
  orchestration: z
    .object({
      workerOnline: z.boolean(),
      automatic: z.boolean(),
      uncertain: z.boolean(),
      activeRequestId: z.string().optional(),
      inFlightId: z.string().optional(),
      control: z.enum(["remote", "handoff"]).optional(),
      handoff: z
        .object({ id: z.string(), itemId: z.string(), expiresAt: z.number() })
        .optional(),
      hostConfirmed: z.boolean().optional(),
    })
    .optional(),
});
export const roomActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), trackId: z.string().max(50) }),
  z.object({
    type: z.enum(["vote", "remove", "promote"]),
    itemId: z.string().max(50),
  }),
  z.object({ type: z.enum(["toggle", "next", "lock", "end"]) }),
]);
export const searchResultsSchema = z.object({ tracks: z.array(trackSchema) });
export const connectionStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  workerOnline: z.boolean().optional(),
});
export type Track = z.infer<typeof trackSchema>;
export type Member = z.infer<typeof memberSchema>;
export type QueueItem = z.infer<typeof queueItemSchema>;
export type PlaybackStatus = z.infer<typeof playbackStatusSchema>;
export type Room = z.infer<typeof roomSchema>;
export type RoomView = z.infer<typeof roomViewSchema>;
export type RoomAction = z.infer<typeof roomActionSchema>;
