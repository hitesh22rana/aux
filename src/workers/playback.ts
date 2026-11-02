import { runWorker } from "@/features/listening-room/server";
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
runWorker(controller.signal).catch(() => {
  console.error(
    "Aux playback worker stopped. Check Redis, Spotify configuration, and shared database access.",
  );
  process.exitCode = 1;
});
