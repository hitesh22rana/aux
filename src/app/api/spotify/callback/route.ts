import { NextRequest, NextResponse } from "next/server";
import {
  spotifyConfig,
  requestTokens,
  spotifyAccount,
  takeOAuth,
  digest,
  bindAccount,
  authorizeSpotify,
  inRoom,
  changeQueue,
  readRoom,
} from "@/features/listening-room/server";

import { errorResponse } from "@/server/http/responses";
import { AppError } from "@/shared/lib/errors";

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
      throw new AppError(
        "Spotify connection could not be verified. Start again from your host room.",
        400,
      );
    const pending = takeOAuth(state);
    roomCode = pending.code;
    const token = request.cookies.get(`aux_${roomCode}`)?.value;
    if (!token || digest(token) !== pending.session)
      throw new AppError(
        "Return to the browser that hosts this room and connect again.",
        403,
      );
    authorizeSpotify(roomCode, token, true);
    returnOrigin = config.origin;
    verifiedHost = true;
    if (request.nextUrl.searchParams.has("error"))
      throw new AppError(
        "Spotify connection was cancelled. You can try again.",
        400,
      );
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096)
      throw new AppError("Spotify did not return an authorization code.", 400);
    await inRoom(roomCode, async () => {
      authorizeSpotify(pending.code, token, true);
      const tokens = await requestTokens({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirect,
        code_verifier: pending.verifier,
      });
      authorizeSpotify(pending.code, token, true);
      const accountId = await spotifyAccount(tokens.access);
      authorizeSpotify(pending.code, token, true);
      bindAccount(pending.code, { ...tokens, accountId }, pending.generation);
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
              `/?${new URLSearchParams({ room: roomCode, spotify: "error", reason: error instanceof AppError ? error.message : "Spotify connection failed. Please try again." })}`,
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
