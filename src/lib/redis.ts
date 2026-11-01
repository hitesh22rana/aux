import "server-only";
import { createClient } from "redis";
import { RoomError } from "./errors";
const namespace = process.env.AUX_QUEUE_NAMESPACE || "aux";
if (!/^[A-Za-z0-9_-]+$/.test(namespace))
  throw new Error("Invalid queue namespace");
export const queueKeys = {
  events: `${namespace}:{queue}:events`,
  due: `${namespace}:{queue}:due`,
  heartbeat: `${namespace}:{queue}:worker`,
  state: (code: string) => `${namespace}:{queue}:room:${code}`,
  lock: (code: string) => `${namespace}:{queue}:lock:${code}`,
};
function makeClient() {
  return createClient({
    RESP: 2,
    url: process.env.REDIS_URL,
    disableOfflineQueue: true,
    socket: { connectTimeout: 3000, reconnectStrategy: false },
  });
}
type Client = ReturnType<typeof makeClient>;
const shared = globalThis as unknown as {
  auxRedis?: Client;
  auxRedisConnecting?: Promise<Client>;
};
export async function redis(): Promise<Client> {
  if (!process.env.REDIS_URL)
    throw new RoomError(
      "Live queues need Redis. Configure REDIS_URL and start the queue worker.",
      503,
    );
  if (shared.auxRedis?.isReady) return shared.auxRedis;
  if (shared.auxRedisConnecting) return shared.auxRedisConnecting;
  const client = makeClient();
  client.on("error", () => {});
  shared.auxRedis = client;
  shared.auxRedisConnecting = client
    .connect()
    .then(() => client)
    .catch(() => {
      throw new RoomError(
        "The live queue is unavailable. Check Redis and try again.",
        503,
      );
    })
    .finally(() => {
      shared.auxRedisConnecting = undefined;
    });
  return shared.auxRedisConnecting!;
}
