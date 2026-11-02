import type { Track } from "../model/contracts";
import { AppError } from "@/shared/lib/errors";

export interface PlaybackSnapshot {
  track: Track | null;
  playing: boolean;
  positionMs: number;
  device: { id: string; name: string; restricted: boolean } | null;
}

/** The worker needs observation and control, not search, OAuth or provider JSON. */
export interface PlaybackControl {
  snapshot(roomCode: string): Promise<PlaybackSnapshot>;
  start(roomCode: string, trackId: string, deviceId: string): Promise<unknown>;
  setPaused(
    roomCode: string,
    paused: boolean,
    deviceId: string,
  ): Promise<unknown>;
}

export class PlaybackError extends AppError {
  constructor(
    message: string,
    status = 502,
    public uncertain = false,
    public retryAfter?: number,
  ) {
    super(message, status);
  }
}
