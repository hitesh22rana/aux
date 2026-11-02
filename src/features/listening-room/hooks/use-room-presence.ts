"use client";
import { createRoomConnection } from "../api/presence-client";
import { useEffect } from "react";
import { PRESENCE_HEARTBEAT_MS } from "../model/presence";

export function useRoomPresence(code: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !code) return;
    const { online, offline, resume } = createRoomConnection(code);
    // Hidden tabs remain connected; mobile suspension is handled by the server timeout.
    const visible = () => {
      if (document.visibilityState === "visible") online();
    };
    online();
    const interval = window.setInterval(online, PRESENCE_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pagehide", offline);
    window.addEventListener("pageshow", resume);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pagehide", offline);
      window.removeEventListener("pageshow", resume);
      offline();
    };
  }, [code, enabled]);
}
