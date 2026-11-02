import * as v from "valibot";
import { roomSchema } from "../model/contracts";
import { db } from "@/server/database/sqlite";
import { AppError } from "@/shared/lib/errors";
export { AppError } from "@/shared/lib/errors";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import {
  colors,
  type Room,
  type RoomView,
  type Provider,
  type Member,
} from "@/features/listening-room/model/room";
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
  const room = v.parse(roomSchema, JSON.parse(row.data));
  return room;
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
  if (!member || member.leftAt)
    throw new AppError("Join this room to continue.", 401);
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
export function createRoom(name: string, person: string, provider: Provider) {
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
      mode: "live",
      tracks: {},
      code,
      name,
      provider,
      members: [member],
      queue: [],
      current: null,
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
export function joinRoom(code: string, name: string, existingToken?: string) {
  return db.transaction(() => {
    const room = readRoom(code);
    if (room.ended) throw new AppError("This session has ended.", 410);
    if (existingToken) {
      try {
        const existing = identify(code, existingToken);
        return { room: view(room, existing.id), token: existingToken };
      } catch (error) {
        if (!(error instanceof AppError && error.status === 401)) throw error;
      }
    }
    if (room.locked)
      throw new AppError(
        "The host has locked this room. Ask them to unlock it.",
        403,
      );
    if (room.members.filter((member) => !member.leftAt).length >= 12)
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
    if (!["lock", "end"].includes(action.type))
      throw new AppError("Use the shared queue service for this action.", 409);
    if (!member.host) throw new AppError("Only the host can do that.", 403);
    if (action.type === "lock") room.locked = !room.locked;
    if (action.type === "end") {
      room.ended = true;
      room.playing = false;
      room.startedAt = null;
    }
    save(room);
    return view(room, member.id);
  })();
}

export function revokeMembership(code: string, token: string | undefined) {
  return db.transaction(() => {
    const member = identify(code, token);
    const room = readRoom(code);
    if (member.host && !room.ended)
      throw new AppError("End the session before leaving.", 409);
    const leaving = room.members.find((person) => person.id === member.id);
    if (leaving) leaving.leftAt = Date.now();
    db.prepare("DELETE FROM sessions WHERE code=? AND member=?").run(
      code,
      member.id,
    );
    save(room);
    return member;
  })();
}
