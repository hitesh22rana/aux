import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { roomCodeSchema } from "@/features/listening-room/contracts";
import {
  identify,
  readRoom,
  updatePresence,
} from "@/features/listening-room/server";
import { checkOrigin, errorResponse } from "@/server/http/responses";
import { AppError } from "@/shared/lib/errors";
const schema = v.object({
  connectionId: v.pipe(v.string(), v.uuid()),
  type: v.picklist(["online", "offline"]),
});
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    checkOrigin(request);
    const code = v.parse(roomCodeSchema, (await context.params).code);
    const member = identify(code, request.cookies.get(`aux_${code}`)?.value);
    const data = v.parse(schema, await request.json());
    if (data.type === "online" && readRoom(code).ended)
      throw new AppError("This session has ended.", 410);
    await updatePresence(code, member.id, data.connectionId, data.type);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
