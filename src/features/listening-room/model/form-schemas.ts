import * as v from "valibot";
import { parseTrackLink, providers, type Provider } from "./providers";

export const plainTextSchema = v.pipe(
  v.string(),
  v.check(
    (value) =>
      !Array.from(value).some((character) => {
        const code = character.codePointAt(0)!;
        return (
          code < 32 ||
          (code >= 127 && code <= 159) ||
          (code >= 0x202a && code <= 0x202e) ||
          (code >= 0x2066 && code <= 0x2069)
        );
      }),
    "Remove control characters from this value.",
  ),
);

export const personNameSchema = v.pipe(
  plainTextSchema,
  v.trim(),
  v.nonEmpty("Enter your name."),
  v.maxLength(24, "Use 24 characters or fewer."),
);
export const roomCodeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.regex(/^[A-F0-9]{6}$/, "Enter the six-character room code."),
);
export const createRoomSchema = v.strictObject({
  person: personNameSchema,
  name: v.pipe(
    plainTextSchema,
    v.trim(),
    v.nonEmpty("Enter a room name."),
    v.maxLength(60, "Use 60 characters or fewer."),
  ),
  provider: v.picklist(providers, "Choose a music app."),
});
export const joinRoomSchema = v.strictObject({
  code: roomCodeSchema,
  person: personNameSchema,
});
export const joinRequestSchema = v.strictObject({ name: personNameSchema });
export const linkedTrackEntries = {
  url: v.pipe(
    plainTextSchema,
    v.trim(),
    v.nonEmpty("Enter a song link."),
    v.maxLength(2048, "This link is too long."),
    v.url("Enter a complete song URL."),
  ),
  title: v.pipe(
    plainTextSchema,
    v.trim(),
    v.nonEmpty("Enter the song title."),
    v.maxLength(120, "Use 120 characters or fewer."),
  ),
  artist: v.optional(
    v.pipe(
      plainTextSchema,
      v.trim(),
      v.maxLength(120, "Use 120 characters or fewer."),
    ),
    "",
  ),
};
export function linkedTrackSchema(provider: Provider) {
  return v.strictObject({
    ...linkedTrackEntries,
    url: v.pipe(
      linkedTrackEntries.url,
      v.check(
        (url) => parseTrackLink(url) !== null,
        "Use a full song link from a supported music app.",
      ),
      v.check(
        (url) => parseTrackLink(url)?.provider === provider,
        `Use a song link from ${provider} for this room.`,
      ),
    ),
  });
}
export type CreateRoomValues = v.InferOutput<typeof createRoomSchema>;
