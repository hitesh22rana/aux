import { db } from "@/server/database/sqlite";
import { AppError } from "@/shared/lib/errors";
export { AppError } from "@/shared/lib/errors";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import {
  catalog,
  colors,
  type Room,
  type RoomView,
  type Provider,
  type Member,
} from "@/features/listening-room/model/catalog";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function readRoom(code: string): Room {
  const row = db
    .prepare("SELECT data, expires FROM rooms WHERE code=?")
    .get(code) as { data: string; expires: number } | undefined;
  if (!row || row.expires < Date.now())
    throw new AppError(
      "This room has expired or doesn’t exist. Check the code and try again.",
      404,
    );
  return JSON.parse(row.data);
}
export function save(room: Room) {
  db.prepare("UPDATE rooms SET data=? WHERE code=?").run(
    JSON.stringify(room),
    room.code,
  );
}
export function identify(code: string, token: string | undefined): Member {
  if (!token) throw new AppError("Join this room to continue.", 401);
  const s = db
    .prepare("SELECT member FROM sessions WHERE token=? AND code=?")
    .get(hash(token), code) as { member: string } | undefined;
  const member = s && readRoom(code).members.find((m) => m.id === s.member);
  if (!member) throw new AppError("Join this room to continue.", 401);
  return member;
}
export function view(room: Room, me: string): RoomView {
  return { ...room, me };
}
function session(code: string, member: string) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    hash(token),
    code,
    member,
  );
  return token;
}
export function createRoom(
  name: string,
  person: string,
  provider: Provider,
  seed: boolean,
  mode: "demo" | "live" = "demo",
) {
  return db.transaction(() => {
    db.prepare(
      "DELETE FROM sessions WHERE code IN (SELECT code FROM rooms WHERE expires < ?)",
    ).run(Date.now());
    db.prepare("DELETE FROM rooms WHERE expires < ?").run(Date.now());
    let code: string;
    do {
      code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    } while (db.prepare("SELECT code FROM rooms WHERE code=?").get(code));
    const member = {
      id: randomBytes(12).toString("hex"),
      name: person,
      color: colors[0],
      host: true,
    };
    const room: Room = {
      mode,
      tracks: {},
      code,
      name,
      provider,
      members: [member],
      queue:
        seed && mode === "demo"
          ? ["sunflower", "ilahi", "less"].map((trackId) => ({
              id: randomBytes(12).toString("hex"),
              trackId,
              memberId: member.id,
              votes: [],
            }))
          : [],
      current: seed && mode === "demo" ? "golden" : null,
      playing: false,
      position: 0,
      startedAt: null,
      locked: false,
      ended: false,
      createdAt: Date.now(),
    };
    db.prepare("INSERT INTO rooms VALUES (?,?,?)").run(
      code,
      JSON.stringify(room),
      Date.now() + 86400000,
    );
    return { room: view(room, member.id), token: session(code, member.id) };
  })();
}
export function joinRoom(code: string, name: string) {
  return db.transaction(() => {
    const room = readRoom(code);
    if (room.ended) throw new AppError("This session has ended.", 410);
    if (room.locked)
      throw new AppError(
        "The host has locked this room. Ask them to unlock it.",
        403,
      );
    if (room.members.length >= 12)
      throw new AppError("This room is full (12 people).", 409);
    const member = {
      id: randomBytes(12).toString("hex"),
      name,
      color: colors[room.members.length % colors.length] ?? colors[0],
      host: false,
    };
    room.members.push(member);
    save(room);
    return { room: view(room, member.id), token: session(code, member.id) };
  })();
}
export type { RoomAction as Action } from "@/features/listening-room/model/contracts";
import type { RoomAction as Action } from "@/features/listening-room/model/contracts";
export function mutate(
  code: string,
  token: string | undefined,
  action: Action,
) {
  return db.transaction(() => {
    const member = identify(code, token);
    const room = readRoom(code);
    if (room.ended) throw new AppError("This session has ended.", 410);
    if (room.mode === "live" && !["vote", "lock", "end"].includes(action.type))
      throw new AppError(
        "Use the connected Spotify player for this action.",
        409,
      );
    const host = () => {
      if (!member.host) throw new AppError("Only the host can do that.", 403);
    };
    if (action.type === "add") {
      if (room.locked && !member.host)
        throw new AppError("Requests are paused by the host.", 403);
      if (!catalog.some((t) => t.id === action.trackId))
        throw new AppError("Choose a song from the demo catalog.");
      if (
        room.queue.some((q) => q.trackId === action.trackId) ||
        room.current === action.trackId
      )
        throw new AppError("That song is already in the queue.", 409);
      if (room.queue.filter((q) => q.memberId === member.id).length >= 3)
        throw new AppError(
          "You have 3 songs queued. Give everyone a turn.",
          409,
        );
      if (!room.current) {
        room.current = action.trackId;
        room.position = 0;
      } else
        room.queue.push({
          id: randomBytes(12).toString("hex"),
          trackId: action.trackId,
          memberId: member.id,
          votes: [],
        });
    } else if (action.type === "vote") {
      const item = room.queue.find((q) => q.id === action.itemId);
      if (!item) throw new AppError("This song is no longer queued.", 404);
      item.votes = item.votes.includes(member.id)
        ? item.votes.filter((id) => id !== member.id)
        : [...item.votes, member.id];
    } else if (action.type === "remove" || action.type === "promote") {
      const index = room.queue.findIndex((q) => q.id === action.itemId);
      if (index < 0) throw new AppError("This song is no longer queued.", 404);
      if (action.type === "remove") {
        if (!member.host && room.queue[index]?.memberId !== member.id)
          throw new AppError("You can only remove your own requests.", 403);
        room.queue.splice(index, 1);
      } else {
        host();
        const [item] = room.queue.splice(index, 1);
        if (item) room.queue.unshift(item);
      }
    } else {
      host();
      if (action.type === "toggle") {
        if (!room.current) throw new AppError("Add a song first.");
        if (room.playing && room.startedAt)
          room.position += Math.floor((Date.now() - room.startedAt) / 1000);
        room.playing = !room.playing;
        room.startedAt = room.playing ? Date.now() : null;
      }
      if (action.type === "next") {
        room.current = room.queue.shift()?.trackId ?? null;
        room.position = 0;
        room.startedAt = room.playing && room.current ? Date.now() : null;
        if (!room.current) room.playing = false;
      }
      if (action.type === "lock") room.locked = !room.locked;
      if (action.type === "end") {
        room.ended = true;
        room.playing = false;
        room.startedAt = null;
      }
    }
    save(room);
    return view(room, member.id);
  })();
}
