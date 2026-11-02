"use client";
import { useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import type { useRoomSession } from "../hooks/use-room-session";
import type { RoomAction } from "../model/contracts";
import type { RoomDialog } from "./room-dialogs";
import {
  RoomSummary,
  RoomInviteCard,
  MobilePlayerSummary,
  type RoomTab,
} from "./room-layout";
import { RoomQueue } from "./room-queue";
import { RoomMembers } from "./room-members";
import { SpotifyConnection } from "./spotify-connection";
import { SpotifySearch } from "./spotify-search";
import { HandoffPanel } from "./handoff-panel";
import { LinkedTrackRequest } from "./linked-track-request";
import { NowPlaying } from "./now-playing";

interface RoomWorkspaceProps {
  session: ReturnType<typeof useRoomSession>;
  tab: RoomTab;
  liked: boolean;
  onLike: () => void;
  openDialog: (dialog: RoomDialog) => void;
  onAction: (action: RoomAction) => Promise<void>;
}
export function RoomWorkspace({
  session,
  tab,
  liked,
  onLike,
  openDialog,
  onAction,
}: RoomWorkspaceProps) {
  const {
    room,
    manual,
    isHost,
    busy,
    current,
    elapsed,
    progress,
    lookup,
    acceptPlayback,
  } = session;
  const columnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const observer = new ResizeObserver(() =>
      column.style.setProperty(
        "--room-column-height",
        `${column.offsetHeight}px`,
      ),
    );
    observer.observe(column);
    return () => observer.disconnect();
  }, []);
  const totalMinutes = Math.ceil(
    room.queue.reduce((n, q) => n + (lookup(q.trackId)?.duration ?? 0), 0) / 60,
  );
  return (
    <div className="workspace-grid">
      <div className="left-column" ref={columnRef}>
        {current && (
          <MobilePlayerSummary current={current} manual={manual} room={room} />
        )}
        {tab === "queue" && (
          <>
            <RoomSummary room={room} />
            <RoomQueue
              room={room}
              live
              manual={manual}
              isHost={isHost}
              busy={busy}
              totalMinutes={totalMinutes}
              lookup={lookup}
              onAction={onAction}
            />
          </>
        )}
        {tab === "people" ? (
          <RoomMembers room={room} busy={busy} onAction={onAction} />
        ) : manual ? (
          <LinkedTrackRequest
            key={room.code}
            room={room}
            onUpdate={acceptPlayback}
          />
        ) : (
          <SpotifySearch
            key={room.code}
            room={room}
            onUpdate={acceptPlayback}
          />
        )}
      </div>
      <aside className="right-column">
        {manual ? (
          <HandoffPanel key={room.code} room={room} onUpdate={acceptPlayback} />
        ) : (
          <SpotifyConnection
            key={room.code}
            room={room}
            onSync={acceptPlayback}
          />
        )}
        <NowPlaying
          room={room}
          current={current}
          live
          manual={manual}
          isHost={isHost}
          busy={busy}
          liked={liked}
          elapsed={elapsed}
          progress={progress}
          onLike={onLike}
          onAction={onAction}
        />
        <RoomInviteCard room={room} real openDialog={openDialog} />
        <div className="session-note">
          <ShieldCheck size={16} />
          <p>
            {isHost ? "You set the tone." : "Everyone gets a turn."}
            <br />
            <span>Everyone brings something to the queue.</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
