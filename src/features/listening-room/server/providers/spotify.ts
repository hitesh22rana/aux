import "server-only";
import { randomUUID } from "node:crypto";
import { redis } from "@/server/redis/connection";
import { queueKeys } from "@/features/listening-room/server/queue-keys";
import { z } from "zod";
import { parseUrl } from "@/shared/lib/url";
import { AppError } from "@/shared/lib/errors";
import {
  getTokens,
  putTokens,
  disconnect,
  type Tokens,
} from "@/features/listening-room/server/spotify-storage";
import type { Track } from "@/features/listening-room/model/catalog";

export const spotifyScopes =
  "user-read-playback-state user-modify-playback-state user-read-private";
export function spotifyConfig() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirect = process.env.SPOTIFY_REDIRECT_URI;
  const key = process.env.AUX_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !redirect || !key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new AppError(
      "Spotify needs server setup: SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, and AUX_TOKEN_ENCRYPTION_KEY. See the setup guide.",
      503,
    );
  const uri = parseUrl(redirect);
  if (
    !uri ||
    uri.pathname !== "/api/spotify/callback" ||
    uri.search ||
    uri.hash ||
    uri.username ||
    uri.password ||
    !(
      uri.protocol === "https:" ||
      (uri.protocol === "http:" &&
        ["127.0.0.1", "[::1]"].includes(uri.hostname))
    )
  )
    throw new AppError(
      "Spotify redirect URI must use HTTPS (or a loopback IP) and end with /api/spotify/callback.",
      503,
    );
  return { clientId, redirect, origin: uri.origin };
}
import { PlaybackError as SpotifyError } from "../playback-port";
export { PlaybackError as SpotifyError } from "../playback-port";
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
});
export async function requestTokens(
  params: Record<string, string>,
  old?: Tokens,
) {
  const { clientId } = spotifyConfig();
  let response: Response;
  try {
    response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: clientId }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new SpotifyError(
      "Couldn’t reach Spotify. Try connecting again.",
      503,
    );
  }
  if (!response.ok)
    throw new SpotifyError(
      "Spotify authorization expired or was rejected. Reconnect your account.",
      401,
    );
  const token = tokenSchema.parse(await response.json());
  const grantedScopes = new Set(token.scope?.split(" "));
  if (
    token.scope &&
    !spotifyScopes.split(" ").every((scope) => grantedScopes.has(scope))
  )
    throw new SpotifyError(
      "Spotify did not grant playback permissions. Reconnect and allow playback control.",
      403,
    );
  if (!token.refresh_token && !old?.refresh)
    throw new SpotifyError(
      "Spotify did not return a refresh token. Connect again.",
      401,
    );
  return {
    access: token.access_token,
    refresh: token.refresh_token || old!.refresh,
    expires: Date.now() + token.expires_in * 1000,
    accountId: old?.accountId || "",
  };
}
const refreshes = new Map<string, Promise<Tokens>>();
async function refresh(code: string, old: Tokens): Promise<Tokens> {
  let work = refreshes.get(code);
  if (!work) {
    work = (async () => {
      const client = await redis();
      const owner = randomUUID();
      const lock = `${queueKeys.lock(code)}:token`;
      let acquired = false;
      for (let i = 0; i < 100; i++) {
        if (await client.set(lock, owner, { NX: true, PX: 20000 })) {
          acquired = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!acquired)
        throw new SpotifyError(
          "Spotify authorization is refreshing. Try again shortly.",
          503,
        );
      try {
        const latest = getTokens(code);
        if (!latest)
          throw new SpotifyError("Reconnect Spotify to continue.", 401);
        if (latest.access !== old.access && latest.expires > Date.now() + 30000)
          return latest;
        const tokens = await requestTokens(
          { grant_type: "refresh_token", refresh_token: latest.refresh },
          latest,
        );
        if (getTokens(code)?.refresh !== latest.refresh)
          throw new SpotifyError("Spotify connection changed. Try again.", 409);
        putTokens(code, tokens);
        return tokens;
      } catch (error) {
        if (
          error instanceof SpotifyError &&
          error.status === 401 &&
          getTokens(code)?.access === old.access
        )
          disconnect(code);
        throw error;
      } finally {
        await client
          .eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
            { keys: [lock], arguments: [owner] },
          )
          .catch(() => {});
      }
    })().finally(() => refreshes.delete(code));
    refreshes.set(code, work);
  }
  return work;
}
async function access(code: string) {
  const tokens = getTokens(code);
  if (!tokens)
    throw new SpotifyError("The host needs to connect Spotify first.", 409);
  return tokens.expires < Date.now() + 30000 ? refresh(code, tokens) : tokens;
}
export async function spotifyRequest<T>(
  code: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T | null> {
  let tokens = await access(code);
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(`https://api.spotify.com/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${tokens.access}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
    } catch {
      throw new SpotifyError(
        method === "GET"
          ? "Couldn’t reach Spotify. Try again."
          : "Spotify did not confirm the command. Check its queue before trying again.",
        503,
        method !== "GET",
      );
    }
    if (response.status === 401 && attempt === 0) {
      tokens = await refresh(code, tokens);
      continue;
    }
    if (!response.ok) {
      if (response.status === 401)
        throw new SpotifyError(
          "Spotify authorization expired. Reconnect your account.",
          401,
        );
      if (response.status === 403)
        throw new SpotifyError(
          "Spotify denied playback access. The host needs Premium, playback permissions, and access to this developer app.",
          403,
        );
      if (response.status === 404)
        throw new SpotifyError(
          "Open Spotify on the host’s phone, start a song, and try again.",
          409,
        );
      if (response.status === 429) {
        const seconds = Math.max(
          1,
          Number(response.headers.get("retry-after")) || 30,
        );
        throw new SpotifyError(
          `Spotify is busy. Try again in ${seconds} seconds.`,
          429,
          false,
          seconds,
        );
      }
      throw new SpotifyError(
        method === "GET"
          ? "Spotify is temporarily unavailable. Try again."
          : "Spotify could not confirm the command. Check its queue before retrying.",
        502,
        method !== "GET",
      );
    }
    return response.status === 204 ? null : ((await response.json()) as T);
  }
  throw new SpotifyError("Reconnect Spotify to continue.", 401);
}
const trackSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string().regex(/^spotify:track:[A-Za-z0-9]{22}$/),
  type: z.literal("track"),
  duration_ms: z.number(),
  is_local: z.boolean().optional(),
  is_playable: z.boolean().optional(),
  restrictions: z.object({ reason: z.string() }).optional(),
  artists: z.array(z.object({ name: z.string() })),
  album: z.object({
    name: z.string(),
    images: z.array(z.object({ url: z.string().url() })),
  }),
});
export function mapSpotifyTrack(raw: unknown): Track | null {
  const parsed = trackSchema.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  if (t.is_local || t.is_playable === false || t.restrictions) return null;
  const image = t.album.images[0]?.url;
  return {
    id: t.uri,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    duration: Math.round(t.duration_ms / 1000),
    art: image && new URL(image).hostname === "i.scdn.co" ? image : "golden",
    mood: "Spotify",
    provider: "Spotify",
    url: `https://open.spotify.com/track/${t.id}`,
  };
}
export type Player = {
  device?: { id: string | null; name: string; is_restricted: boolean };
  is_playing: boolean;
  progress_ms: number | null;
  item: unknown;
  actions?: {
    disallows?: {
      pausing?: boolean;
      resuming?: boolean;
      skipping_next?: boolean;
    };
  };
};
export interface PlaybackAdapter {
  search(code: string, query: string): Promise<Track[]>;
  track(code: string, id: string): Promise<Track>;
  player(code: string): Promise<Player | null>;
  play(code: string, uri: string, device: string): Promise<unknown>;
  toggle(code: string, playing: boolean, device: string): Promise<unknown>;
}
export const spotify: PlaybackAdapter = {
  async search(code, query) {
    const link = spotifyTrackId(query);
    if (link) return [await this.track(code, link)];
    if (/^https?:|^spotify:/i.test(query))
      throw new AppError(
        "For now, paste a Spotify track link or search by song and artist. Other services are not connected.",
        400,
      );
    const data = await spotifyRequest<{ tracks?: { items: unknown[] } }>(
      code,
      `/search?${new URLSearchParams({ q: query, type: "track", limit: "10" })}`,
    );
    return (data?.tracks?.items ?? [])
      .map(mapSpotifyTrack)
      .filter((t): t is Track => !!t);
  },
  async track(code, id) {
    const data = await spotifyRequest(
      code,
      `/tracks/${encodeURIComponent(id)}`,
    );
    const track = mapSpotifyTrack(data);
    if (!track)
      throw new AppError(
        "That track is unavailable on the host’s Spotify account.",
        422,
      );
    return track;
  },
  player: (code) => spotifyRequest<Player>(code, "/me/player"),
  play: (code, uri, device) =>
    spotifyRequest(
      code,
      `/me/player/play?${new URLSearchParams({ device_id: device })}`,
      "PUT",
      { uris: [uri], position_ms: 0 },
    ),
  toggle: (code, playing, device) =>
    spotifyRequest(
      code,
      `/me/player/${playing ? "pause" : "play"}?${new URLSearchParams({ device_id: device })}`,
      "PUT",
    ),
};
export function spotifyTrackId(input: string) {
  if (/^spotify:track:[A-Za-z0-9]{22}$/.test(input)) return input.split(":")[2];
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com")
      return null;
    return (
      url.pathname.match(
        /^\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})\/?$/,
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}
