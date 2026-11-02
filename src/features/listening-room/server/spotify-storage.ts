import * as v from "valibot";
import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { db } from "@/server/database/sqlite";
import { roomSchema } from "../model/contracts";
import { AppError } from "@/shared/lib/errors";

db.exec(`CREATE TABLE IF NOT EXISTS spotify_connections (code TEXT PRIMARY KEY REFERENCES rooms(code), tokens TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS spotify_oauth (state TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS spotify_dispatches (code TEXT NOT NULL, request_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(code, request_id));
CREATE TRIGGER IF NOT EXISTS cleanup_spotify_room AFTER DELETE ON rooms BEGIN DELETE FROM spotify_connections WHERE code=OLD.code; DELETE FROM spotify_dispatches WHERE code=OLD.code; DELETE FROM spotify_oauth WHERE json_extract(data,'$.code')=OLD.code; END;`);
export type Tokens = {
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
};
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function key() {
  const value = process.env.AUX_TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value))
    throw new AppError(
      "Set AUX_TOKEN_ENCRYPTION_KEY to a 64-character hex key on the server.",
      503,
    );
  return Buffer.from(value, "hex");
}
function seal(value: unknown, room: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(room));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}
function unseal<T>(value: string, room: string): T {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !data)
    throw new Error("Stored credentials have an invalid encryption envelope.");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(Buffer.from(room));
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(data), decipher.final()]).toString(),
  );
}
export function putTokens(code: string, tokens: Tokens) {
  db.prepare("INSERT OR REPLACE INTO spotify_connections VALUES (?,?)").run(
    code,
    seal(tokens, code),
  );
}
export function getTokens(code: string) {
  const row = db
    .prepare("SELECT tokens FROM spotify_connections WHERE code=?")
    .get(code) as { tokens: string } | undefined;
  return row ? unseal<Tokens>(row.tokens, code) : null;
}
export function hasConnection(code: string) {
  return !!db
    .prepare("SELECT code FROM spotify_connections WHERE code=?")
    .get(code);
}
export function disconnect(code: string) {
  db.prepare("DELETE FROM spotify_connections WHERE code=?").run(code);
  db.prepare(
    "DELETE FROM spotify_oauth WHERE json_extract(data,'$.code')=?",
  ).run(code);
}
export type OAuthState = { code: string; session: string; verifier: string };
export function putOAuth(state: string, data: OAuthState) {
  db.prepare("DELETE FROM spotify_oauth WHERE expires < ?").run(Date.now());
  db.prepare("INSERT INTO spotify_oauth VALUES (?,?,?)").run(
    digest(state),
    JSON.stringify({ ...data, verifier: seal(data.verifier, data.code) }),
    Date.now() + 600000,
  );
}
export function takeOAuth(state: string): OAuthState {
  const row = db.transaction(() => {
    const found = db
      .prepare("SELECT data,expires FROM spotify_oauth WHERE state=?")
      .get(digest(state)) as { data: string; expires: number } | undefined;
    db.prepare("DELETE FROM spotify_oauth WHERE state=?").run(digest(state));
    return found;
  })();
  if (!row || row.expires < Date.now())
    throw new AppError(
      "This connection link expired. Connect Spotify again.",
      400,
    );
  const data = JSON.parse(row.data);
  return { ...data, verifier: unseal<string>(data.verifier, data.code) };
}
export function cleanupSpotify() {
  db.prepare(
    "DELETE FROM spotify_connections WHERE code NOT IN (SELECT code FROM rooms WHERE expires > ?)",
  ).run(Date.now());
  db.prepare(
    "DELETE FROM spotify_dispatches WHERE code NOT IN (SELECT code FROM rooms WHERE expires > ?)",
  ).run(Date.now());
  db.prepare("DELETE FROM spotify_oauth WHERE expires < ?").run(Date.now());
}

// Two Aux workers must not compete for the same Spotify account in different rooms.
export function bindAccount(code: string, tokens: Tokens) {
  db.transaction(() => {
    const rows = db
      .prepare(
        "SELECT c.code,c.tokens,r.data FROM spotify_connections c JOIN rooms r ON r.code=c.code WHERE c.code<>? AND r.expires>?",
      )
      .all(code, Date.now()) as {
      code: string;
      tokens: string;
      data: string;
    }[];
    for (const row of rows) {
      const room = v.parse(roomSchema, JSON.parse(row.data));
      if (
        !room.ended &&
        unseal<Tokens>(row.tokens, row.code).accountId === tokens.accountId
      )
        throw new AppError(
          "This Spotify account is hosting another room. End or disconnect that room first.",
          409,
        );
    }
    putTokens(code, tokens);
  })();
}
