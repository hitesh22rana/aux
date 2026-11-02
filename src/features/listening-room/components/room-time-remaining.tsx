"use client";

import { useEffect, useState } from "react";

export function RoomTimeRemaining({
  createdAt,
  ended,
}: {
  createdAt: number;
  ended: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);
  if (ended) return <span>Session ended</span>;
  if (now === null) return <span>Checking room time…</span>;
  const minutes = Math.max(0, Math.ceil((createdAt + 86400000 - now) / 60000));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return (
    <span>
      {minutes === 0
        ? "Room expired"
        : `Room expires in ${hours ? `${hours}h ` : ""}${remaining}m`}
    </span>
  );
}
