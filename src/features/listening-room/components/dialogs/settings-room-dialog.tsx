"use client";

import { DoorOpen, Headphones, ListMusic, ShieldCheck } from "lucide-react";

import type { RoomView, RoomAction } from "../../model/contracts";

import { RoomModal } from "./room-modal";
interface SettingsRoomDialogProps {
  onClose: () => void;
  room: RoomView;
  isHost: boolean;
  live: boolean;
  manual: boolean;
  busy: boolean;
  onAction: (action: RoomAction) => Promise<void>;
  onLeave: () => Promise<boolean>;
}
function playbackNote(live: boolean, manual: boolean): string {
  if (!live) return "Create or join a room to manage playback.";
  if (manual)
    return "The host opens each selected track in the music app and confirms playback. Aux cannot pause or stop that app. Ending this session only closes the shared queue.";
  return "Aux owns this queue and controls the host’s active Spotify player. Audio stays in Spotify. Ending the session stops future dispatch; the current song may finish in Spotify.";
}
export function SettingsRoomDialog({
  onClose,
  room,
  isHost,
  live,
  manual,
  busy,
  onAction: action,
  onLeave,
}: SettingsRoomDialogProps) {
  return (
    <RoomModal
      onClose={onClose}
      title="Room settings"
      description={
        isHost
          ? "A few settings for a better shared session."
          : "Your host manages playback and room settings."
      }
    >
      <div className="settings-row">
        <div>
          <b>Pause new requests</b>
          <p>Lock joining and guest song requests.</p>
        </div>
        <button
          aria-label="Pause new requests"
          aria-pressed={room.locked}
          className={`toggle ${room.locked ? "on" : ""}`}
          disabled={!isHost || busy || room.ended}
          onClick={() => action({ type: "lock" })}
        >
          <span />
        </button>
      </div>
      <div className="settings-row">
        <div>
          <b>Make room for everyone</b>
          <p>Up to 3 queued songs per person.</p>
        </div>
        <ShieldCheck size={20} />
      </div>
      <div className="settings-row">
        <div>
          <b>Queue order</b>
          <p>
            First come, first played. Votes show love.
            <br />
            {live
              ? "Aux manages queue order; pending requests can be removed or moved to next."
              : "The host can move a request to next."}
          </p>
        </div>
        <ListMusic size={20} />
      </div>
      <div className="form-note mt-4">
        <Headphones size={17} />
        <span>
          {playbackNote(live, manual)}
          {isHost && !room.ended && " Leaving ends this session for everyone."}
        </span>
      </div>
      <div className="flex gap-3 mt-6">
        <button
          className={`button ${isHost && !room.ended ? "danger" : "secondary"} flex-1`}
          disabled={busy}
          onClick={async () => {
            if (await onLeave()) onClose();
          }}
        >
          <DoorOpen size={16} />
          {isHost && !room.ended ? "End session and leave" : "Leave room"}
        </button>
      </div>
    </RoomModal>
  );
}
