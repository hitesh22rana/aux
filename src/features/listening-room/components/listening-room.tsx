"use client";
import {
  RoomHeader,
  RoomHeading,
  RoomSummary,
  RoomInviteCard,
  MobilePlayerSummary,
  type RoomTab,
} from "./room-layout";
import { RoomQueue } from "./room-queue";
import { RoomMembers } from "./room-members";
import { DemoDiscovery } from "./demo-discovery";
import styles from "../listening-room.module.css";

import { useCallback, useState } from "react";
import { ArrowRight, Check, CircleHelp, ShieldCheck } from "lucide-react";

import { SpotifyConnection } from "@/features/listening-room/components/spotify-connection";
import { SpotifySearch } from "@/features/listening-room/components/spotify-search";
import { HandoffPanel } from "@/features/listening-room/components/handoff-panel";
import { LinkedTrackRequest } from "@/features/listening-room/components/linked-track-request";

import { type RoomAction } from "@/features/listening-room/model/contracts";

import { NowPlaying } from "@/features/listening-room/components/now-playing";
import { RoomDialogs, type RoomDialog as Dialog } from "./room-dialogs";
import { useRoomSession } from "../hooks/use-room-session";

export function ListeningRoom() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<RoomTab>("queue");
  const [joinCode, setJoinCode] = useState("");
  const [menu, setMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const onJoinRequired = useCallback((code: string) => {
    setJoinCode(code);
    setDialog("join");
  }, []);
  const {
    room,
    real,
    ready,
    busy: sessionBusy,
    offline,
    isHost,
    live,
    manual,
    current,
    elapsed,
    progress,
    lookup,
    acceptPlayback,
    setActiveRoom,
    action: roomAction,
    resetSession,
  } = useRoomSession(onJoinRequired);
  const busy = sessionBusy;
  async function action(value: RoomAction) {
    await roomAction(value);
    if (value.type === "next") setLiked(false);
  }
  function openDialog(value: Dialog) {
    setMenu(false);
    setDialog(value);
  }
  function reset() {
    resetSession();
    setDialog(null);
    setTab("queue");
  }
  const totalMinutes = Math.ceil(
    room.queue.reduce((n, q) => n + (lookup(q.trackId)?.duration ?? 0), 0) / 60,
  );
  return (
    <div className={styles.root}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <RoomHeader
        room={room}
        real={real}
        tab={tab}
        menu={menu}
        onTabChange={(value) => {
          setTab(value);
          setMenu(false);
        }}
        onToggleMenu={() => setMenu((previous) => !previous)}
        openDialog={openDialog}
      />

      <div className="main-shell">
        <main id="main" className="main-content">
          <RoomHeading
            room={room}
            real={real}
            ready={ready}
            tab={tab}
            openDialog={openDialog}
          />
          {offline && (
            <div className="connection-warning" role="status">
              Connection interrupted. Reconnecting… Your last saved queue is
              shown.
            </div>
          )}
          {room.ended && (
            <div className="ended-banner">
              <Check size={18} />
              This session has ended. Start a new room whenever you’re ready.
              <button onClick={() => openDialog("create")}>
                New room
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className="workspace-grid">
            <div className="left-column">
              {current && (
                <MobilePlayerSummary
                  current={current}
                  manual={manual}
                  room={room}
                />
              )}
              {tab === "queue" && (
                <>
                  <RoomSummary
                    room={room}
                    real={real}
                    live={live}
                    openDialog={openDialog}
                  />

                  <RoomQueue
                    room={room}
                    live={live}
                    manual={manual}
                    isHost={isHost}
                    busy={busy}
                    totalMinutes={totalMinutes}
                    lookup={lookup}
                    openDialog={openDialog}
                    onAction={action}
                  />
                </>
              )}
              {tab === "people" ? (
                <RoomMembers room={room} real={real} openDialog={openDialog} />
              ) : manual ? (
                <LinkedTrackRequest
                  key={room.code}
                  room={room}
                  onUpdate={acceptPlayback}
                />
              ) : live ? (
                <SpotifySearch
                  key={room.code}
                  room={room}
                  onUpdate={acceptPlayback}
                />
              ) : (
                <DemoDiscovery
                  key={tab}
                  room={room}
                  busy={busy}
                  isHost={isHost}
                  expanded={tab === "discover"}
                  onAction={action}
                  onBrowse={() =>
                    setTab(tab === "discover" ? "queue" : "discover")
                  }
                />
              )}
            </div>
            <aside className="right-column">
              {manual ? (
                <HandoffPanel
                  key={room.code}
                  room={room}
                  onUpdate={acceptPlayback}
                />
              ) : (
                live && (
                  <SpotifyConnection
                    key={room.code}
                    room={room}
                    onSync={acceptPlayback}
                  />
                )
              )}
              <NowPlaying
                room={room}
                current={current}
                live={live}
                manual={manual}
                isHost={isHost}
                busy={busy}
                liked={liked}
                elapsed={elapsed}
                progress={progress}
                onLike={() => setLiked((previous) => !previous)}
                onAction={action}
              />
              <RoomInviteCard room={room} real={real} openDialog={openDialog} />

              <div className="session-note">
                <ShieldCheck size={16} />
                <p>
                  {isHost ? "You set the tone." : "Everyone gets a turn."}
                  <br />
                  <span>Three requests each. Room for everyone.</span>
                </p>
              </div>
            </aside>
          </div>
          <footer className="page-footer">
            <span>Made for listening together.</span>
            <span>
              <button
                className="text-button"
                onClick={() => openDialog("about")}
              >
                <CircleHelp size={14} />
                How Aux works
              </button>
            </span>
          </footer>
        </main>
      </div>
      <RoomDialogs
        key={`${dialog ?? "closed"}:${joinCode}`}
        dialog={dialog}
        onDialogChange={setDialog}
        initialJoinCode={joinCode}
        room={room}
        real={real}
        ready={ready}
        isHost={isHost}
        live={live}
        manual={manual}
        sessionBusy={busy}
        onRoomReady={setActiveRoom}
        onAction={action}
        onReset={reset}
      />
    </div>
  );
}
