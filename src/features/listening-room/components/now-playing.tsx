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
} from "@/features/listening-room/model/catalog";
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
          {manual
            ? room.orchestration?.hostConfirmed
              ? "Host confirmed"
              : "Waiting for host"
            : room.playing
              ? "Now playing"
              : "On the deck"}
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
      {!manual && (
        <>
          <div
            className="playback-progress"
            role="progressbar"
            aria-label={
              live ? "Spotify playback progress" : "Simulated song progress"
            }
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
          <div className="playback-controls">
            <span className="side-a">AUX / 01</span>
            <button
              className="play-button"
              aria-label={
                live
                  ? room.playing
                    ? "Pause Spotify playback"
                    : "Resume Spotify playback"
                  : room.playing
                    ? "Pause demo playback"
                    : "Play demo playback"
              }
              disabled={
                !isHost ||
                (!current && !(live && room.queue.length)) ||
                busy ||
                room.ended ||
                (live &&
                  (!room.playback?.connected ||
                    !room.playback.device ||
                    room.playback.device.restricted))
              }
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
              disabled={
                !isHost ||
                busy ||
                room.ended ||
                (!current && !(live && room.queue.length)) ||
                (live &&
                  (!room.playback?.connected ||
                    !room.playback.device ||
                    room.playback.device.restricted))
              }
              onClick={() => onAction({ type: "next" })}
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
          </div>
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
        <span>
          {live
            ? manual
              ? `Host-led · ${room.provider}`
              : room.playback?.device
                ? `Playing on ${room.playback.device.name}`
                : "Audio stays in Spotify"
            : "Playback preview · no audio"}
        </span>
        <Volume2 size={14} />
      </div>
    </section>
  );
}
