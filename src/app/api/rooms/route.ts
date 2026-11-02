import { readJsonBody } from "@/server/http/request-body";
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { redis } from "@/server/redis/connection";
import {
  changeQueue,
  liveView,
  createRoom,
  browserSessions,
} from "@/features/listening-room/server";
import { createRoomSchema } from "@/features/listening-room/contracts";

import {
  checkOrigin,
  errorResponse,
  withSession,
} from "@/server/http/responses";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      { sessions: browserSessions(request.cookies.getAll()) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const data = v.parse(createRoomSchema, await readJsonBody(request));
    await (await redis()).ping();
    const created = createRoom(data.name, data.person, data.provider);
    await changeQueue(created.room, () => {}, "created");
    created.room = await liveView(created.room, created.room.me);
    return withSession(created, request);
  } catch (error) {
    return errorResponse(error);
  }
}
