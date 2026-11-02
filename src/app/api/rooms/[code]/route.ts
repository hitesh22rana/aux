import { roomActionSchema } from "@/features/listening-room/contracts";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  liveView,
  liveCommand,
  readRoom,
  identify,
  joinRoom,
  mutate,
  view,
} from "@/features/listening-room/server";

import {
  checkOrigin,
  errorResponse,
  withSession,
} from "@/server/http/responses";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };
const codeSchema = z.string().regex(/^[A-F0-9]{6}$/);
export async function GET(request: NextRequest, context: Context) {
  try {
    const code = codeSchema.parse((await context.params).code.toUpperCase());
    const room = readRoom(code);
    const member = identify(code, request.cookies.get(`aux_${code}`)?.value);
    return NextResponse.json(
      room.mode === "live"
        ? await liveView(room, member.id)
        : view(room, member.id),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    checkOrigin(request);
    const code = codeSchema.parse((await context.params).code.toUpperCase());
    const data = z
      .object({ name: z.string().trim().min(1).max(24) })
      .parse(await request.json());
    return withSession(joinRoom(code, data.name), request);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    checkOrigin(request);
    const code = codeSchema.parse((await context.params).code.toUpperCase());
    const action = roomActionSchema.parse(await request.json());
    return NextResponse.json(
      readRoom(code).mode === "live"
        ? await liveCommand(
            code,
            request.cookies.get(`aux_${code}`)?.value,
            action,
          )
        : mutate(code, request.cookies.get(`aux_${code}`)?.value, action),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
