export {
  providers,
  type Provider,
} from "@/features/listening-room/model/providers";
import type { RoomView } from "@/features/listening-room/model/contracts";
export type {
  Track,
  Member,
  QueueItem,
  PlaybackStatus,
  Room,
  RoomView,
} from "@/features/listening-room/model/contracts";
export const colors = [
  "#dfedb3",
  "#f2c1a7",
  "#c9c5e6",
  "#b9d5dc",
  "#e8cb80",
  "#d8c2b7",
] as const;
export function emptyRoom(): RoomView {
  return {
    mode: "live",
    tracks: {},
    code: "",
    name: "The listening room",
    provider: "Spotify",
    members: [],
    queue: [],
    current: null,
    playing: false,
    position: 0,
    startedAt: null,
    locked: false,
    ended: false,
    createdAt: 0,
    me: "",
  };
}
export const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
