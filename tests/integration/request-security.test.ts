import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { readJsonBody } from "@/server/http/request-body";
import {
  personNameSchema,
  createRoomSchema,
} from "@/features/listening-room/model/form-schemas";
import { roomActionSchema } from "@/features/listening-room/model/contracts";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}
describe("untrusted request boundaries", () => {
  it("bounds streamed JSON even without a length header", async () => {
    await expect(
      readJsonBody(request(JSON.stringify({ name: "x".repeat(17000) }))),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJsonBody(request("{}", { "Content-Length": "17000" })),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJsonBody(request("{}", { "Content-Type": "text/plain" })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(readJsonBody(request("{"))).rejects.toBeInstanceOf(
      SyntaxError,
    );
    await expect(readJsonBody(request('{"name":"Alex"}'))).resolves.toEqual({
      name: "Alex",
    });
  });
  it("rejects control characters, overlong names, forged fields and malformed member IDs", () => {
    for (const name of ["x".repeat(25), "Alex\u0000", "A\u202elex", " "])
      expect(v.safeParse(personNameSchema, name).success).toBe(false);
    expect(
      v.safeParse(createRoomSchema, {
        person: "Alex",
        name: "Room",
        provider: "Spotify",
        host: true,
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(roomActionSchema, { type: "kick", memberId: "../host" })
        .success,
    ).toBe(false);
    expect(
      v.safeParse(roomActionSchema, {
        type: "kick",
        memberId: "a".repeat(24),
        host: true,
      }).success,
    ).toBe(false);
    expect(v.parse(personNameSchema, " O’Connor ")).toBe("O’Connor");
  });
});
