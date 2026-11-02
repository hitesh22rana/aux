import "server-only";
import type { PlaybackControl } from "../playback-port";
import { spotify, mapSpotifyTrack } from "./spotify";

export const spotifyControl: PlaybackControl = {
  async snapshot(code) {
    const player = await spotify.player(code);
    return {
      track: mapSpotifyTrack(player?.item),
      playing: player?.is_playing ?? false,
      positionMs: player?.progress_ms ?? 0,
      device: player?.device?.id
        ? {
            id: player.device.id,
            name: player.device.name,
            restricted: player.device.is_restricted,
          }
        : null,
    };
  },
  start: (code, trackId, deviceId) => spotify.play(code, trackId, deviceId),
  setPaused: (code, paused, deviceId) => spotify.toggle(code, paused, deviceId),
};
