import { NextRequest } from "next/server";
import { z } from "zod";
import { redis } from "@/lib/redis";
import { changeQueue, liveView } from "@/lib/live-queue";
import { providers } from "@/lib/catalog";
import { createRoom } from "@/lib/store";
import { checkOrigin, errorResponse, withSession } from "@/lib/api";
export const runtime = "nodejs";
const schema = z.object({
  name: z.string().trim().min(1).max(60),
  person: z.string().trim().min(1).max(24),
  provider: z.enum(providers),
  seed: z.boolean().default(false),
  mode: z.enum(["demo", "live"]).default("demo"),
});
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const data = schema.parse(await request.json());
    if (data.mode === "live") await (await redis()).ping();
    const created = createRoom(
      data.name,
      data.person,
      data.provider,
      data.seed,
      data.mode,
    );
    if (data.mode === "live") {
      await changeQueue(created.room, () => {}, "created");
      created.room = await liveView(created.room, created.room.me);
    }
    return withSession(created, request);
  } catch (error) {
    return errorResponse(error);
  }
}
