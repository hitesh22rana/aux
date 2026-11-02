"use client";

import { useRef, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import styles from "./theme-toggle.module.css";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeToggle() {
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const { resolvedTheme, setTheme } = useTheme();
  const transitionRef = useRef<ViewTransition | null>(null);
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  function toggleTheme() {
    transitionRef.current?.skipTransition();
    if (
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTheme(nextTheme);
      return;
    }
    // Commit the new theme before the browser captures the incoming colors.
    transitionRef.current = document.startViewTransition(() => {
      flushSync(() => setTheme(nextTheme));
    });
    // A superseded transition can reject its ready promise during rapid clicks.
    void transitionRef.current.ready.catch(() => {});
  }

  return (
    <button
      type="button"
      className={styles.control}
      aria-label={
        mounted ? `Switch to ${nextTheme} mode` : "Toggle color theme"
      }
      disabled={!mounted}
      onClick={toggleTheme}
    >
      <Sun
        className={styles.sun}
        size={18}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <Moon
        className={styles.moon}
        size={18}
        strokeWidth={1.8}
        aria-hidden="true"
      />
    </button>
  );
}
