import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, errorResponse } from "@/lib/api";
import {
  authorizeSpotify,
  searchTracks,
  requestTrack,
  syncPlayer,
  recoverQueue,
  disconnectRoom,
} from "@/lib/orchestrator";
import { spotifyConfig } from "@/lib/playback/spotify";
import {
  hasConnection,
  putOAuth,
  digest,
  cleanupSpotify,
} from "@/lib/spotify-storage";
import { randomBytes, createHash } from "node:crypto";
import { redis, queueKeys } from "@/lib/redis";
import { RoomError } from "@/lib/errors";
import { spotifyScopes } from "@/lib/playback/spotify";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };
const codeSchema = z.string().regex(/^[A-F0-9]{6}$/);
async function context(request: NextRequest, ctx: Context) {
  const code = codeSchema.parse((await ctx.params).code.toUpperCase());
  return { code, token: request.cookies.get(`aux_${code}`)?.value };
}
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const { code, token } = await context(request, ctx);
    const { member } = authorizeSpotify(code, token);
    const query = request.nextUrl.searchParams.get("q");
    if (query !== null) {
      const q = z.string().trim().min(2).max(160).parse(query);
      return NextResponse.json(
        { tracks: await searchTracks(code, token, q) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    let configured = true;
    try {
      spotifyConfig();
    } catch {
      configured = false;
    }
    return NextResponse.json(
      {
        configured,
        connected: hasConnection(code),
        host: member.host,
        workerOnline: !!(await (await redis()).exists(queueKeys.heartbeat)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connect") }),
  z.object({ type: z.literal("disconnect") }),
  z.object({ type: z.literal("sync") }),
  z.object({ type: z.literal("recover") }),
  z.object({
    type: z.literal("request"),
    uri: z.string().regex(/^spotify:track:[A-Za-z0-9]{22}$/),
    requestId: z.uuid(),
  }),
]);
export async function POST(request: NextRequest, ctx: Context) {
  try {
    checkOrigin(request);
    const { code, token } = await context(request, ctx);
    const action = schema.parse(await request.json());
    if (action.type === "request")
      return NextResponse.json(
        await requestTrack(code, token, action.uri, action.requestId),
      );
    authorizeSpotify(code, token, true);
    if (action.type === "sync")
      return NextResponse.json(await syncPlayer(code, token));
    if (action.type === "recover")
      return NextResponse.json(await recoverQueue(code, token));
    if (action.type === "disconnect") {
      await disconnectRoom(code, token);
      return NextResponse.json({ connected: false });
    }
    const config = spotifyConfig();
    const host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host !== new URL(config.origin).host)
      throw new RoomError(
        `Open Aux at ${config.origin} before connecting Spotify, so the host session matches the callback.`,
        409,
      );
    cleanupSpotify();
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(64).toString("base64url");
    putOAuth(state, { code, session: digest(token!), verifier });
    const url = new URL("https://accounts.spotify.com/authorize");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirect,
      scope: spotifyScopes,
      state,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    const response = NextResponse.json({ url: url.toString() });
    response.cookies.set("aux_spotify_oauth", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
      path: "/api/spotify/callback",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
