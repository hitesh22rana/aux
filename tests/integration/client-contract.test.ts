import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson, errorMessage } from "@/shared/api/http-client";
import {
  roomViewSchema,
  roomActionSchema,
} from "@/features/listening-room/model/contracts";
import { emptyRoom } from "@/features/listening-room/model/room";

afterEach(() => vi.unstubAllGlobals());

describe("client API contracts", () => {
  it("rejects malformed successful responses before they reach room state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ code: "ABC123", queue: null })),
    );
    await expect(
      requestJson("/api/rooms/ABC123", roomViewSchema),
    ).rejects.toThrow("unexpected data");
  });
  it("validates a complete room and carries request headers and cancellation", async () => {
    const room = emptyRoom();
    const fetcher = vi.fn().mockResolvedValue(Response.json(room));
    const controller = new AbortController();
    vi.stubGlobal("fetch", fetcher);
    expect(
      await requestJson("/api/rooms", roomViewSchema, {
        method: "POST",
        body: JSON.stringify({ name: "Room" }),
        signal: controller.signal,
      }),
    ).toEqual(room);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/rooms",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      }),
    );
    const options: RequestInit | undefined = fetcher.mock.calls[0]?.[1];
    expect(new Headers(options?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });
  it("preserves server permission errors and handles non-JSON failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Only the host can do that." }, { status: 403 }),
      )
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      requestJson("/api/rooms/ABC123", roomViewSchema),
    ).rejects.toThrow("Only the host");
    await expect(
      requestJson("/api/rooms/ABC123", roomViewSchema),
    ).rejects.toThrow("Couldn’t connect");
  });
  it("requires each action's own fields", () => {
    expect(
      v.safeParse(roomActionSchema, { type: "add", itemId: "request" }).success,
    ).toBe(false);
    expect(v.safeParse(roomActionSchema, { type: "vote" }).success).toBe(false);
    expect(
      v.safeParse(roomActionSchema, { type: "remove", itemId: "request" })
        .success,
    ).toBe(true);
  });
  it("handles unknown thrown values without unsafe error casts", () => {
    expect(errorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(errorMessage(new Error("Connection interrupted"))).toBe(
      "Connection interrupted",
    );
  });
});

it("retains HTTP status so invitation failures can be handled without parsing messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: "Join this room to continue." },
          { status: 401 },
        ),
      ),
  );
  await expect(
    requestJson("/api/rooms/ABC123", roomViewSchema),
  ).rejects.toMatchObject({
    name: "HttpError",
    message: "Join this room to continue.",
    status: 401,
  });
});
