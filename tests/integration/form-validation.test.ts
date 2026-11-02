import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  createRoomSchema,
  joinRoomSchema,
  linkedTrackSchema,
} from "@/features/listening-room/model/form-schemas";

describe("shared form validation", () => {
  it("normalizes names and codes without allowing empty or oversized input", () => {
    expect(
      v.parse(joinRoomSchema, { code: " ab12cd ", person: " Alex " }),
    ).toEqual({ code: "AB12CD", person: "Alex" });
    expect(
      v.safeParse(createRoomSchema, {
        name: " ",
        person: "Alex",
        provider: "Spotify",
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(createRoomSchema, {
        name: "Room",
        person: "x".repeat(25),
        provider: "Spotify",
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(joinRoomSchema, { code: "xyz123", person: "Alex" }).success,
    ).toBe(false);
  });
  it("rejects unsafe, unsupported and mismatched service links", () => {
    const schema = linkedTrackSchema("Apple Music");
    for (const url of [
      "",
      "not-a-url",
      "javascript:alert(1)",
      "http://music.apple.com/us/song/456",
      "https://example.com/song/456",
      "https://music.amazon.com/tracks/B012345678",
      "https://music.apple.com/us/album/123",
    ]) {
      expect(v.safeParse(schema, { url, title: "Song" }).success, url).toBe(
        false,
      );
    }
  });
  it("trims track fields, defaults an omitted artist and enforces length limits", () => {
    const schema = linkedTrackSchema("Apple Music");
    const song = {
      url: "https://music.apple.com/us/album/123?i=456",
      title: " Song ",
    };
    expect(v.parse(schema, song)).toEqual({
      ...song,
      title: "Song",
      artist: "",
    });
    expect(v.safeParse(schema, { ...song, title: " " }).success).toBe(false);
    expect(
      v.safeParse(schema, { ...song, artist: "x".repeat(121) }).success,
    ).toBe(false);
  });
});
