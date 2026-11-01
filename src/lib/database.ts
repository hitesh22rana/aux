import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
const root = process.env.AUX_DATA_DIR || path.join(process.cwd(), ".data");
mkdirSync(root, { recursive: true });
const globalDb = globalThis as unknown as { auxDb?: Database.Database };
export const db = (globalDb.auxDb ??= new Database(
  path.join(root, "aux.sqlite"),
));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(
  "CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, code TEXT NOT NULL, member TEXT NOT NULL); CREATE INDEX IF NOT EXISTS session_room ON sessions(code)",
);
