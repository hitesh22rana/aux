import "server-only";
import { redis } from "@/server/redis/connection";
import { queueKeys } from "./queue-keys";
import { PRESENCE_WINDOW_MS } from "../model/presence";
import type { Member, Room } from "../model/contracts";

// A short-lived tombstone prevents a late heartbeat from undoing a tab's departure.
const update = `
if ARGV[1]=='online' then
  if redis.call('EXISTS',KEYS[2])==1 then return 0 end
  redis.call('ZADD',KEYS[1],ARGV[2],ARGV[3])
  redis.call('PEXPIRE',KEYS[1],ARGV[4])
else
  redis.call('ZREM',KEYS[1],ARGV[3])
  redis.call('SET',KEYS[2],'1','PX',ARGV[4])
end
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',tonumber(ARGV[2])-tonumber(ARGV[4]))
return 1`;

export async function updatePresence(
  code: string,
  member: string,
  connection: string,
  type: "online" | "offline",
) {
  const client = await redis();
  await client.eval(update, {
    keys: [
      queueKeys.presence(code),
      queueKeys.presenceClosed(code, member, connection),
    ],
    arguments: [
      type,
      String(Date.now()),
      `${member}:${connection}`,
      String(PRESENCE_WINDOW_MS),
    ],
  });
}
export async function roomPresence(room: Room): Promise<Member[]> {
  const client = await redis();
  const key = queueKeys.presence(room.code);
  await client.zRemRangeByScore(key, "-inf", Date.now() - PRESENCE_WINDOW_MS);
  const connections = await client.zRange(key, 0, -1);
  const counts = new Map<string, number>();
  for (const connection of connections) {
    const member = connection.split(":")[0];
    if (member) counts.set(member, (counts.get(member) ?? 0) + 1);
  }
  return room.members.map((member) => ({
    ...member,
    active: !member.leftAt && (counts.get(member.id) ?? 0) > 0,
    connections: member.leftAt ? 0 : (counts.get(member.id) ?? 0),
  }));
}
export async function clearMemberPresence(code: string, member: string) {
  const client = await redis();
  const key = queueKeys.presence(code);
  const connections = (await client.zRange(key, 0, -1)).filter((connection) =>
    connection.startsWith(`${member}:`),
  );
  if (connections.length) await client.zRem(key, connections);
}
