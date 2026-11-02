"use client";

import { ArrowDown, ListMusic, ShieldCheck } from "lucide-react";
import type { RoomView, RoomAction, Track } from "../model/contracts";

import { QueueRow } from "./queue-row";
interface RoomQueueProps {
  room: RoomView;
  live: boolean;
  manual: boolean;
  isHost: boolean;
  busy: boolean;
  totalMinutes: number;
  lookup: (id: string | null) => Track | undefined;
  onAction: (action: RoomAction) => Promise<void>;
}
function queueSubtitle(
  room: RoomView,
  manual: boolean,
  totalMinutes: number,
): string {
  if (!room.queue.length) return "Add a song to get the session started";
  if (manual)
    return `${room.queue.length} ${room.queue.length === 1 ? "request" : "requests"} · host-led playback`;
  return `${totalMinutes} min of good company`;
}
export function RoomQueue({
  room,
  live,
  manual,
  isHost,
  busy,
  totalMinutes,
  lookup,
  onAction,
}: RoomQueueProps) {
  return (
    <section className="queue-section">
      <div className="section-heading">
        <div>
          <h2>
            {live ? "Song requests" : "Up next"}{" "}
            <span className="count-pill">{room.queue.length}</span>
          </h2>
          <p>{queueSubtitle(room, manual, totalMinutes)}</p>
        </div>
      </div>
      <div className="queue-table">
        <div className="queue-table-head">
          <span>#</span>
          <span>Track</span>
          <span>Added by</span>
          <span>Time</span>
        </div>
        {room.queue.map((item, index) => {
          const track = lookup(item.trackId);
          return track ? (
            <QueueRow
              key={item.id}
              item={item}
              index={index}
              track={track}
              room={room}
              live={live}
              manual={manual}
              isHost={isHost}
              busy={busy}
              onAction={onAction}
            />
          ) : null;
        })}
        {!room.queue.length && <EmptyQueue live={live} manual={manual} />}
      </div>
      {live && (
        <p className="live-queue-note">
          {manual
            ? "Aux owns this queue. The host opens each selected song and confirms playback."
            : "Aux owns this queue. The worker hands one selected song at a time to the host’s player."}
        </p>
      )}
      <div className="queue-note">
        <ShieldCheck size={14} />
        {room.locked
          ? "The host has paused new requests."
          : "Good aux etiquette: queue a little, leave room for everyone."}
      </div>
    </section>
  );
}
function EmptyQueue({ live, manual }: { live: boolean; manual: boolean }) {
  return (
    <div className="empty-state">
      <ListMusic size={27} />
      <h3>Your next great song goes here.</h3>
      <p>Pick something below and get this session started.</p>
      <button
        className="text-button"
        onClick={() => {
          if (live)
            document
              .getElementById(manual ? "linked-song-url" : "spotify-search")
              ?.focus();
        }}
      >
        Find a song
        <ArrowDown size={14} />
      </button>
    </div>
  );
}
