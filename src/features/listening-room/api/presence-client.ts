export function createRoomConnection(code: string) {
  let connectionId = crypto.randomUUID();
  let closed = false;
  const url = `/api/rooms/${code}/presence`;
  const body = (type: "online" | "offline") =>
    JSON.stringify({ type, connectionId });
  const online = () => {
    if (closed) return;
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body("online"),
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  };
  const offline = () => {
    if (closed) return;
    closed = true;
    const data = new Blob([body("offline")], { type: "application/json" });
    if (!navigator.sendBeacon(url, data))
      void fetch(url, { method: "POST", body: data, keepalive: true }).catch(
        () => {},
      );
  };
  const resume = () => {
    if (closed) {
      connectionId = crypto.randomUUID();
      closed = false;
    }
    online();
  };

  return { online, offline, resume };
}
