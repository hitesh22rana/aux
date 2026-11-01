import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { RoomError } from "./store";
export function errorResponse(error: unknown) {
  if (error instanceof RoomError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError || error instanceof SyntaxError)
    return NextResponse.json(
      { error: "Check your details and try again." },
      { status: 400 },
    );
  console.error("Room request failed", error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
export function checkOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && new URL(origin).host !== host)
    throw new RoomError("Request origin not allowed.", 403);
}
export function withSession(
  data: { room: { code: string }; token: string },
  request: NextRequest,
) {
  const response = NextResponse.json(data.room);
  response.cookies.set(`aux_${data.room.code}`, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 86400,
    path: "/",
  });
  return response;
}
