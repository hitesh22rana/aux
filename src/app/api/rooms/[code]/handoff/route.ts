import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, errorResponse } from "@/lib/api";
import {
  requestLinkedTrack,
  prepareHandoff,
  confirmHandoff,
  cancelHandoff,
  finishHandoff,
} from "@/lib/handoff";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("request"),
    url: z.string().trim().url().max(2048),
    title: z.string().trim().min(1).max(120),
    artist: z.string().trim().max(120).default(""),
    requestId: z.uuid(),
  }),
  z.object({
    type: z.literal("prepare"),
    itemId: z.string().max(60).optional(),
  }),
  z.object({ type: z.enum(["confirm", "cancel"]), selectionId: z.uuid() }),
  z.object({ type: z.literal("finish") }),
]);
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    checkOrigin(request);
    const code = z
      .string()
      .regex(/^[A-F0-9]{6}$/)
      .parse((await ctx.params).code.toUpperCase());
    const token = request.cookies.get(`aux_${code}`)?.value;
    const action = schema.parse(await request.json());
    if (action.type === "request")
      return NextResponse.json(await requestLinkedTrack(code, token, action));
    if (action.type === "prepare")
      return NextResponse.json(
        await prepareHandoff(code, token, action.itemId),
      );
    if (action.type === "confirm")
      return NextResponse.json(
        await confirmHandoff(code, token, action.selectionId),
      );
    if (action.type === "cancel")
      return NextResponse.json(
        await cancelHandoff(code, token, action.selectionId),
      );
    return NextResponse.json(await finishHandoff(code, token));
  } catch (error) {
    return errorResponse(error);
  }
}
