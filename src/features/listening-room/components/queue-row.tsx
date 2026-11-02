"use client";
import { ArrowUp, ChevronUp, X } from "lucide-react";
import {
  time,
  type QueueItem,
  type RoomView,
  type Track,
} from "@/features/listening-room/model/catalog";
import type { RoomAction } from "@/features/listening-room/model/contracts";
import {
  Art,
  ProviderMark,
} from "@/features/listening-room/components/music-art";
interface QueueRowProps {
  item: QueueItem;
  index: number;
  track: Track;
  room: RoomView;
  live: boolean;
  manual: boolean;
  isHost: boolean;
  busy: boolean;
  onAction: (action: RoomAction) => Promise<void>;
}
export function QueueRow({
  item,
  index,
  track,
  room,
  live,
  manual,
  isHost,
  busy,
  onAction,
}: QueueRowProps) {
  const member = room.members.find((m) => m.id === item.memberId);
  return (
    <div className="queue-row group" key={item.id}>
      <span className="queue-number">{index + 1}</span>
      <Art track={track} />
      <div className="song-info">
        <div className="font-medium truncate">{track.title}</div>
        <div className="text-xs text-muted truncate mt-1">{track.artist}</div>
        {live && (
          <span className="delivery-status">
            {room.orchestration?.inFlightId === item.id
              ? manual
                ? "Selected by host"
                : "Handing to Spotify…"
              : "Waiting in Aux"}
          </span>
        )}
        {live && track.url && (
          <a
            className="spotify-track-link"
            href={track.url}
            target="_blank"
            rel="noreferrer"
          >
            Open in {track.provider} ↗
          </a>
        )}
      </div>
      <span className="requester">
        <span className="mini-avatar" style={{ background: member?.color }}>
          {member?.name[0]}
        </span>
        {member?.id === room.me ? "You" : member?.name}
      </span>
      <ProviderMark provider={track.provider} small />
      <span className="duration">
        {track.duration ? time(track.duration) : "-"}
      </span>
      <button
        className={`vote-button ${item.votes.includes(room.me) ? "voted" : ""}`}
        aria-label={`Vote for ${track.title}`}
        aria-pressed={item.votes.includes(room.me)}
        disabled={busy || room.ended}
        onClick={() => onAction({ type: "vote", itemId: item.id })}
      >
        <ChevronUp size={14} />
        {item.votes.length}
      </button>
      {(isHost || item.memberId === room.me) && (
        <button
          className="icon-button remove-button"
          aria-label={`Remove ${track.title}`}
          disabled={busy || room.ended}
          onClick={() => onAction({ type: "remove", itemId: item.id })}
        >
          <X size={14} />
        </button>
      )}
      {isHost && index > 0 && (
        <button
          className="icon-button promote-button"
          aria-label={`Move ${track.title} to next`}
          disabled={busy || room.ended}
          onClick={() => onAction({ type: "promote", itemId: item.id })}
        >
          <ArrowUp size={14} />
        </button>
      )}
    </div>
  );
}
