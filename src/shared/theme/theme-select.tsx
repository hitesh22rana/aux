"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { SunMoon } from "lucide-react";
import styles from "./theme-select.module.css";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeSelect() {
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const { theme, setTheme } = useTheme();
  return (
    <label
      className={styles.control}
      title="Color theme: System, Light, or Dark"
    >
      <SunMoon size={18} aria-hidden="true" />
      <select
        aria-label="Color theme"
        value={mounted ? theme : "system"}
        disabled={!mounted}
        onChange={(event) => setTheme(event.target.value)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
