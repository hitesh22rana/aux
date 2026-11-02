import { readJsonBody } from "@/server/http/request-body";
import { linkedTrackEntries } from "@/features/listening-room/contracts";
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { checkOrigin, errorResponse } from "@/server/http/responses";
import {
  requestLinkedTrack,
  prepareHandoff,
  confirmHandoff,
  cancelHandoff,
  finishHandoff,
} from "@/features/listening-room/server";
export const runtime = "nodejs";
const schema = v.variant("type", [
  v.strictObject({
    type: v.literal("request"),
    ...linkedTrackEntries,
    requestId: v.pipe(v.string(), v.uuid()),
  }),
  v.strictObject({
    type: v.literal("prepare"),
    itemId: v.optional(v.pipe(v.string(), v.maxLength(60))),
  }),
  v.strictObject({
    type: v.picklist(["confirm", "cancel"]),
    selectionId: v.pipe(v.string(), v.uuid()),
  }),
  v.strictObject({ type: v.literal("finish") }),
]);
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    checkOrigin(request);
    const code = v.parse(
      v.pipe(v.string(), v.regex(/^[A-F0-9]{6}$/)),
      (await ctx.params).code.toUpperCase(),
    );
    const token = request.cookies.get(`aux_${code}`)?.value;
    const action = v.parse(schema, await readJsonBody(request));
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
