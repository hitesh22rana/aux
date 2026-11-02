import { LoaderCircle } from "lucide-react";
import styles from "./room-entry-loader.module.css";
export function RoomEntryLoader() {
  return (
    <main
      id="main"
      className={styles.loader}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoaderCircle size={28} aria-hidden="true" />
      <p>Opening your room…</p>
    </main>
  );
}
