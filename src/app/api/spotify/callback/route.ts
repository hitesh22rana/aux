import { NextRequest, NextResponse } from "next/server";
import {
  spotifyConfig,
  requestTokens,
  spotifyRequest,
} from "@/lib/playback/spotify";
import {
  takeOAuth,
  digest,
  putTokens,
  bindAccount,
  disconnect,
} from "@/lib/spotify-storage";
import { authorizeSpotify, inRoom } from "@/lib/orchestrator";
import { errorResponse } from "@/lib/api";
import { RoomError } from "@/lib/errors";
import { changeQueue } from "@/lib/live-queue";
import { readRoom } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let roomCode: string | undefined;
  let returnOrigin: string | undefined;
  let verifiedHost = false;
  try {
    const config = spotifyConfig();
    const state = request.nextUrl.searchParams.get("state");
    if (
      !state ||
      state.length > 128 ||
      request.cookies.get("aux_spotify_oauth")?.value !== state
    )
      throw new RoomError(
        "Spotify connection could not be verified. Start again from your host room.",
        400,
      );
    const pending = takeOAuth(state);
    roomCode = pending.code;
    const token = request.cookies.get(`aux_${roomCode}`)?.value;
    if (!token || digest(token) !== pending.session)
      throw new RoomError(
        "Return to the browser that hosts this room and connect again.",
        403,
      );
    authorizeSpotify(roomCode, token, true);
    returnOrigin = config.origin;
    verifiedHost = true;
    if (request.nextUrl.searchParams.has("error"))
      throw new RoomError(
        "Spotify connection was cancelled. You can try again.",
        400,
      );
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096)
      throw new RoomError("Spotify did not return an authorization code.", 400);
    await inRoom(roomCode, async () => {
      authorizeSpotify(pending.code, token, true);
      const tokens = await requestTokens({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirect,
        code_verifier: pending.verifier,
      });
      authorizeSpotify(pending.code, token, true);
      putTokens(pending.code, tokens);
      try {
        const profile = await spotifyRequest<{ id: string }>(
          pending.code,
          "/me",
        );
        if (!profile?.id)
          throw new RoomError("Spotify did not return an account.", 502);
        authorizeSpotify(pending.code, token, true);
        bindAccount(pending.code, { ...tokens, accountId: profile.id });
      } catch (error) {
        disconnect(pending.code);
        throw error;
      }
    });
    await changeQueue(readRoom(roomCode), () => {}, "connected");
    const response = NextResponse.redirect(
      new URL(`/?room=${roomCode}&spotify=connected`, config.origin),
    );
    response.cookies.set("aux_spotify_oauth", "", {
      httpOnly: true,
      path: "/api/spotify/callback",
      maxAge: 0,
    });
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    const response =
      verifiedHost && roomCode && returnOrigin
        ? NextResponse.redirect(
            new URL(
              `/?${new URLSearchParams({ room: roomCode, spotify: "error", reason: error instanceof RoomError ? error.message : "Spotify connection failed. Please try again." })}`,
              returnOrigin,
            ),
          )
        : errorResponse(error);
    response.cookies.set("aux_spotify_oauth", "", {
      httpOnly: true,
      path: "/api/spotify/callback",
      maxAge: 0,
    });
    response.headers.set("Referrer-Policy", "no-referrer");
    if (roomCode) response.headers.set("X-Aux-Room", roomCode);
    return response;
  }
}
