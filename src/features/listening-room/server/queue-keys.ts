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
