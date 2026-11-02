"use client";
import {
  AudioLines,
  Headphones,
  Heart,
  Pause,
  Play,
  SkipForward,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  time,
  type RoomView,
  type Track,
} from "@/features/listening-room/model/room";
import type { RoomAction } from "@/features/listening-room/model/contracts";
import {
  Art,
  ProviderMark,
} from "@/features/listening-room/components/music-art";
interface NowPlayingProps {
  room: RoomView;
  current: Track | undefined;
  live: boolean;
  manual: boolean;
  isHost: boolean;
  busy: boolean;
  liked: boolean;
  elapsed: number;
  progress: number;
  onLike: () => void;
  onAction: (action: RoomAction) => Promise<void>;
}
export function NowPlaying({
  room,
  current,
  live,
  manual,
  isHost,
  busy,
  liked,
  elapsed,
  progress,
  onLike,
  onAction,
}: NowPlayingProps) {
  return (
    <section
      id="current-player"
      className="now-playing"
      aria-label="Current song"
    >
      <div className="now-playing-heading">
        <span>
          <span className={`live-dot ${room.playing ? "" : "paused"}`} />
          {statusLabel(room, manual)}
        </span>
        <Headphones size={15} />
      </div>
      <div className="record-stage">
        {current ? (
          <Art track={current} size={400} priority className="player-cover" />
        ) : (
          <div className="empty-record">
            <AudioLines size={48} />
            <span>Your next song starts here</span>
          </div>
        )}
      </div>
      <CurrentTrack
        room={room}
        current={current}
        live={live}
        liked={liked}
        onLike={onLike}
      />
      {!manual && (
        <>
          <PlaybackTimeline
            live={live}
            current={current}
            elapsed={elapsed}
            progress={progress}
          />
          <PlaybackControls
            room={room}
            current={current}
            live={live}
            isHost={isHost}
            busy={busy}
            onAction={onAction}
          />
        </>
      )}
      {manual && (
        <p className="handoff-status-note">
          {current
            ? "Reported by the host. Playback state and progress are not observed."
            : "Select a request above to open it in the music app."}
        </p>
      )}
      <div className="playing-through">
        <ProviderMark provider={room.provider} small />
        <span>{destinationLabel(room, live, manual)}</span>
        <Volume2 size={14} />
      </div>
    </section>
  );
}

function statusLabel(room: RoomView, manual: boolean): string {
  if (manual)
    return room.orchestration?.hostConfirmed
      ? "Host confirmed"
      : "Waiting for host";
  return room.playing ? "Now playing" : "On the deck";
}
function destinationLabel(
  room: RoomView,
  live: boolean,
  manual: boolean,
): string {
  if (!live) return "Waiting for playback";
  if (manual) return `Host-led · ${room.provider}`;
  return room.playback?.device
    ? `Playing on ${room.playback.device.name}`
    : "Audio stays in Spotify";
}
function toggleLabel(live: boolean, playing: boolean): string {
  if (live)
    return playing ? "Pause Spotify playback" : "Resume Spotify playback";
  return playing ? "Pause playback" : "Resume playback";
}
function CurrentTrack({
  room,
  current,
  live,
  liked,
  onLike,
}: Pick<NowPlayingProps, "room" | "current" | "live" | "liked" | "onLike">) {
  return (
    <div className="current-track">
      <div>
        <h2>{current?.title || "Your soundtrack awaits"}</h2>
        {live && current?.url && (
          <a
            className="spotify-track-link"
            href={current.url}
            target="_blank"
            rel="noreferrer"
          >
            Open in {room.provider} ↗
          </a>
        )}
        <p>{current?.artist || "Add your first song to the queue"}</p>
      </div>
      <button
        className={`icon-button heart ${liked ? "liked" : ""}`}
        aria-label={liked ? "Unlike current song" : "Like current song"}
        aria-pressed={liked}
        onClick={() => {
          onLike();
          toast(liked ? "Like removed" : "Liked for this session");
        }}
        disabled={!current}
      >
        <Heart size={19} fill={liked ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
function PlaybackTimeline({
  live,
  current,
  elapsed,
  progress,
}: Pick<NowPlayingProps, "live" | "current" | "elapsed" | "progress">) {
  return (
    <>
      <div
        className="playback-progress"
        role="progressbar"
        aria-label={live ? "Spotify playback progress" : "Song progress"}
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="time-labels">
        <span>{time(Math.min(elapsed, current?.duration ?? 0))}</span>
        <span>{time(current?.duration ?? 0)}</span>
      </div>
    </>
  );
}
function PlaybackControls({
  room,
  current,
  live,
  isHost,
  busy,
  onAction,
}: Pick<
  NowPlayingProps,
  "room" | "current" | "live" | "isHost" | "busy" | "onAction"
>) {
  const hasSelection = Boolean(current || (live && room.queue.length));
  const unavailableDevice =
    live &&
    (!room.playback?.connected ||
      !room.playback.device ||
      room.playback.device.restricted);
  const disabled =
    !isHost || busy || room.ended || !hasSelection || unavailableDevice;
  return (
    <div className="playback-controls">
      <span className="side-a">AUX / 01</span>
      <button
        className="play-button"
        aria-label={toggleLabel(live, room.playing)}
        disabled={disabled}
        onClick={() => onAction({ type: "toggle" })}
      >
        {room.playing ? (
          <Pause size={21} fill="currentColor" />
        ) : (
          <Play size={21} fill="currentColor" className="ml-0.5" />
        )}
      </button>
      <button
        className="icon-button"
        aria-label="Skip to next song"
        disabled={disabled}
        onClick={() => onAction({ type: "next" })}
      >
        <SkipForward size={20} fill="currentColor" />
      </button>
    </div>
  );
}
