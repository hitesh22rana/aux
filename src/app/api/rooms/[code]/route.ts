import {
  roomActionSchema,
  roomCodeSchema,
  joinRequestSchema,
} from "@/features/listening-room/contracts";
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import {
  liveView,
  liveCommand,
  readRoom,
  identify,
  joinRoom,
} from "@/features/listening-room/server";

import {
  checkOrigin,
  errorResponse,
  withSession,
} from "@/server/http/responses";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };
const codeSchema = roomCodeSchema;
export async function GET(request: NextRequest, context: Context) {
  try {
    const code = v.parse(codeSchema, (await context.params).code.toUpperCase());
    const room = readRoom(code);
    const member = identify(code, request.cookies.get(`aux_${code}`)?.value);
    return NextResponse.json(await liveView(room, member.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    checkOrigin(request);
    const code = v.parse(codeSchema, (await context.params).code.toUpperCase());
    const data = v.parse(joinRequestSchema, await request.json());
    return withSession(joinRoom(code, data.name), request);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    checkOrigin(request);
    const code = v.parse(codeSchema, (await context.params).code.toUpperCase());
    const action = v.parse(roomActionSchema, await request.json());
    return NextResponse.json(
      await liveCommand(
        code,
        request.cookies.get(`aux_${code}`)?.value,
        action,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
