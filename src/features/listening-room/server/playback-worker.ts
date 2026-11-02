import "server-only";
import { randomUUID } from "node:crypto";
import { redis } from "@/server/redis/connection";
import { queueKeys } from "@/features/listening-room/server/queue-keys";
import {
  changeQueue,
  queueState,
  type Operation,
} from "@/features/listening-room/server/live-queue";
import { providerDefinition } from "@/features/listening-room/model/providers";
import { readRoom } from "@/features/listening-room/server/room-repository";
import {
  hasConnection,
  cleanupSpotify,
  disconnect,
} from "@/features/listening-room/server/spotify-storage";
import { spotifyControl } from "./providers/spotify-control";
import { PlaybackError, type PlaybackControl } from "./playback-port";
import { AppError } from "@/shared/lib/errors";
const group = "playback-workers";
const leaseMs = 45000;
const releaseLua =
  "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
const renewLua =
  "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end";
export async function processRoom(
  code: string,
  playback: PlaybackControl = spotifyControl,
) {
  const client = await redis();
  const owner = randomUUID();
  const key = queueKeys.lock(code);
  if (!(await client.set(key, owner, { NX: true, PX: leaseMs }))) return false;
  let leaseLost = false;
  const renewal = setInterval(() => {
    void client
      .eval(renewLua, { keys: [key], arguments: [owner, String(leaseMs)] })
      .then((n) => {
        if (!Number(n)) leaseLost = true;
      })
      .catch(() => {
        leaseLost = true;
      });
  }, 10000);
  try {
    const room = readRoom(code);
    if (providerDefinition(room.provider).control !== "remote") {
      await client.zRem(queueKeys.due, code);
      return true;
    }
    if (room.ended || !hasConnection(code)) {
      if (room.ended) disconnect(code);
      await client.zRem(queueKeys.due, code);
      return true;
    }
    let state = await queueState(room);
    if (state.ended) return true;
    if (state.retryAt && state.retryAt > Date.now()) return true;
    const player = await playback.snapshot(code);
    const track = player.track;
    const previous = {
      active: state.active,
      lastProgress: state.lastProgress,
      lastSeen: state.lastSeen,
      lastPlaying: state.lastPlaying,
    };
    await changeQueue(
      room,
      (s) => {
        s.current = track?.id ?? null;
        if (track) s.tracks[track.id] = track;
        s.playing = player.playing ?? false;
        s.position = (player.positionMs ?? 0) / 1000;
        s.startedAt = s.playing ? Date.now() : null;
        s.playback = {
          connected: true,
          device: player?.device?.id
            ? {
                id: player.device.id,
                name: player.device.name,
                restricted: player.device.restricted,
              }
            : null,
          syncedAt: Date.now(),
        };
      },
      "",
    );
    state = await queueState(room);
    const activeDevice = player?.device?.id;
    if (!activeDevice || player.device?.restricted) {
      await changeQueue(
        room,
        (s) => {
          s.playback!.error =
            "Open Spotify on the host’s phone, choose it as the active player, and start a song.";
        },
        "",
      );
      return true;
    }
    // Reconcile a command that may have reached Spotify before a worker crash.
    if (state.operation) {
      const op = state.operation;
      const confirmed =
        op.kind === "start"
          ? track?.id === op.item?.trackId && !!player.playing
          : op.kind === "pause"
            ? !player.playing
            : !!player.playing;
      if (confirmed) {
        await changeQueue(
          room,
          (s) => {
            if (s.operation?.id !== op.id) return;
            if (op.kind === "start" && op.item) {
              s.queue = s.queue.filter((q) => q.id !== op.item!.id);
              s.active = op.item;
              s.automation = true;
            }
            if (op.kind === "pause") s.automation = false;
            if (op.kind === "resume") s.automation = true;
            s.controls = s.controls.filter((c) => c.id !== op.commandId);
            delete s.operation;
            s.lastPlaying = player.playing;
            s.lastProgress = player.positionMs ?? 0;
            s.lastSeen = Date.now();
          },
          "",
        );
        state = await queueState(room);
      } else if (
        op.phase === "uncertain" ||
        op.phase === "sending" ||
        Date.now() - op.at > 12000
      ) {
        await changeQueue(
          room,
          (s) => {
            if (s.operation?.id === op.id) {
              s.operation.phase = "uncertain";
              s.automation = false;
              s.playback!.error =
                "Playback was not confirmed. Check Spotify, then use Resume Aux to continue.";
            }
          },
          "",
        );
        state = await queueState(room);
        if (state.controls[0]?.type !== "recover") return true;
      } else return true;
    }
    let command = state.controls[0];
    if (command?.type === "recover") {
      await changeQueue(
        room,
        (s) => {
          s.controls = s.controls.filter((c) => c.id !== command!.id);
          if (s.operation) {
            s.controls = s.controls.filter(
              (c) => c.id !== s.operation!.commandId,
            );
            delete s.operation;
          }
          s.automation = false;
        },
        "",
      );
      state = await queueState(room);
      command = { id: command.id, type: "next" };
    }
    let kind: Operation["kind"] | undefined;
    let next = state.queue[0];
    if (command) {
      if (command.type === "next" || (!state.active && next)) {
        kind = next ? "start" : "pause";
      } else kind = player.playing ? "pause" : "resume";
    } else if (state.automation && state.active) {
      const duration =
        (state.tracks[state.active.trackId]?.duration ?? 0) * 1000;
      const nearEnd =
        (previous.lastProgress ?? 0) >= Math.max(0, duration - 6500) &&
        Date.now() - (previous.lastSeen ?? 0) < 20000;
      const changed = track?.id !== state.active.trackId;
      const rolledOver =
        track?.id === state.active.trackId &&
        nearEnd &&
        !!previous.lastPlaying &&
        !!player.playing &&
        (player.positionMs ?? 0) < 2500;
      const finishedSame =
        track?.id === state.active.trackId &&
        !player.playing &&
        nearEnd &&
        !!previous.lastPlaying;
      if (
        (changed && nearEnd && previous.lastPlaying) ||
        finishedSame ||
        rolledOver
      ) {
        kind = next ? "start" : "pause";
      } else if (changed) {
        await changeQueue(
          room,
          (s) => {
            s.automation = false;
            s.playback!.error =
              "Playback changed in Spotify. Aux paused its queue; use Resume Aux when you’re ready.";
          },
          "",
        );
        return true;
      }
    }
    if (!kind) {
      await changeQueue(
        room,
        (s) => {
          s.lastPlaying = player.playing;
          s.lastProgress = player.positionMs ?? 0;
          s.lastSeen = Date.now();
        },
        "",
      );
      return true;
    }
    if (leaseLost)
      throw new AppError("Worker lease was lost before dispatch.", 503);
    const op: Operation = {
      id: randomUUID(),
      kind,
      item: kind === "start" ? next : undefined,
      commandId: command?.id,
      phase: "sending",
      at: Date.now(),
    };
    // Claim the next request atomically. UI cannot remove a request while dispatching it.
    await changeQueue(
      room,
      (s) => {
        if (s.ended) throw new AppError("Session ended.", 410);
        if (s.operation)
          throw new AppError("Another command is in progress.", 409);
        if (kind === "start") {
          next = s.queue[0];
          if (!next) throw new AppError("The queue is now empty.", 409);
          op.item = next;
        }
        s.operation = op;
      },
      "",
    );
    try {
      if (kind === "start")
        await playback.start(code, op.item!.trackId, activeDevice);
      else await playback.setPaused(code, kind === "pause", activeDevice);
      if (leaseLost) return false;
      await changeQueue(
        room,
        (s) => {
          if (s.operation?.id === op.id) {
            s.operation.phase = "confirming";
            s.operation.at = Date.now();
          }
        },
        "",
      );
    } catch (error) {
      const uncertain =
        !(error instanceof AppError) ||
        (error instanceof PlaybackError && error.uncertain);
      await changeQueue(
        room,
        (s) => {
          if (s.operation?.id !== op.id) return;
          s.automation = false;
          s.playback!.error =
            error instanceof AppError
              ? error.message
              : "Player command was not confirmed. Check Spotify.";
          if (error instanceof PlaybackError && error.retryAfter)
            s.retryAt = Date.now() + error.retryAfter * 1000;
          if (uncertain) s.operation.phase = "uncertain";
          else {
            delete s.operation;
            s.controls = s.controls.filter((c) => c.id !== op.commandId);
          }
        },
        "",
      );
    }
    return true;
  } catch (error) {
    if (error instanceof AppError && [404, 410].includes(error.status)) {
      disconnect(code);
      await client.zRem(queueKeys.due, code);
      return true;
    }
    try {
      const room = readRoom(code);
      await changeQueue(
        room,
        (s) => {
          s.retryAt =
            Date.now() +
            ((error instanceof PlaybackError ? error.retryAfter : undefined) ||
              10) *
              1000;
          s.playback = {
            ...s.playback,
            connected: hasConnection(code),
            device: s.playback?.device ?? null,
            syncedAt: Date.now(),
            error:
              error instanceof AppError
                ? error.message
                : "Playback worker could not reach the player.",
          };
        },
        "",
      );
    } catch {
      // Keep the original failure if the best-effort status update also fails.
    }
    return false;
  } finally {
    clearInterval(renewal);
    await client
      .eval(releaseLua, { keys: [key], arguments: [owner] })
      .catch(() => {});
  }
}
type Entry = [string, string[]];
export async function runWorker(signal: AbortSignal) {
  const client = await redis();
  const reader = client.duplicate();
  reader.on("error", () => {});
  await reader.connect();
  const consumer = `worker-${randomUUID()}`;
  try {
    await client.sendCommand([
      "XGROUP",
      "CREATE",
      queueKeys.events,
      group,
      "0",
      "MKSTREAM",
    ]);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("BUSYGROUP"))
      throw error;
  }
  async function handle(entry: Entry) {
    const [id, fields] = entry;
    const code = fields[fields.indexOf("room") + 1];
    if (!code || !/^[A-F0-9]{6}$/.test(code)) {
      await client.sendCommand(["XACK", queueKeys.events, group, id]);
      await client.sendCommand(["XDEL", queueKeys.events, id]);
      return;
    }
    if (await processRoom(code)) {
      await client.sendCommand(["XACK", queueKeys.events, group, id]);
      await client.sendCommand(["XDEL", queueKeys.events, id]);
    }
  }
  const heartbeat = setInterval(() => {
    void client
      .set(queueKeys.heartbeat, String(Date.now()), { EX: 15 })
      .catch(() => {});
  }, 4000);
  await client.set(queueKeys.heartbeat, String(Date.now()), { EX: 15 });
  let claimCursor = "0-0";
  let sweepAt = 0;
  try {
    console.log("Aux playback worker is ready.");
    while (!signal.aborted) {
      const now = Date.now();
      if (now > sweepAt) {
        const claimed = (await client.sendCommand([
          "XAUTOCLAIM",
          queueKeys.events,
          group,
          consumer,
          "45000",
          claimCursor,
          "COUNT",
          "10",
        ])) as [string, Entry[]];
        claimCursor = claimed[0];
        for (const entry of claimed[1]) await handle(entry);
        sweepAt = now + 5000;
      }
      const due = await client.zRangeByScore(queueKeys.due, 0, Date.now(), {
        LIMIT: { offset: 0, count: 20 },
      });
      for (const code of due) {
        await client.zAdd(queueKeys.due, {
          score: Date.now() + 4000,
          value: code,
        });
        await processRoom(code);
      }
      const result = (await reader.sendCommand([
        "XREADGROUP",
        "GROUP",
        group,
        consumer,
        "COUNT",
        "10",
        "BLOCK",
        "1000",
        "STREAMS",
        queueKeys.events,
        ">",
      ])) as [string, Entry[]][] | null;
      for (const [, entries] of result ?? [])
        for (const entry of entries) await handle(entry);
    }
  } finally {
    clearInterval(heartbeat);
    await reader.close();
    await client.close();
    cleanupSpotify();
  }
}
