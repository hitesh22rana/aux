"use client";
import { RoomHeader, RoomHeading, type RoomTab } from "./room-layout";
import { RoomEntryLoader } from "./room-entry-loader";
import { RoomLanding } from "./room-landing";
import { RoomWorkspace } from "./room-workspace";
import styles from "../listening-room.module.css";

import { useCallback, useState } from "react";
import { ArrowRight, Check, CircleHelp } from "lucide-react";

import { type RoomAction } from "@/features/listening-room/model/contracts";

import { RoomDialogs, type RoomDialog as Dialog } from "./room-dialogs";
import { useRoomSession } from "../hooks/use-room-session";

export function ListeningRoom({
  initialRoomCode,
}: {
  initialRoomCode?: string;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<RoomTab>("queue");
  const [joinCode, setJoinCode] = useState("");
  const [menu, setMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const onJoinRequired = useCallback((code: string) => {
    setJoinCode(code);
    setDialog("join");
  }, []);
  const session = useRoomSession(onJoinRequired, initialRoomCode);
  const {
    room,
    real,
    ready,
    busy: sessionBusy,
    offline,
    entryError,
    isHost,
    live,
    manual,
    setActiveRoom,
    action: roomAction,
    resetSession,
    leaveSession,
    resolving,
    openRoom,
  } = session;
  const busy = sessionBusy;
  async function action(value: RoomAction) {
    await roomAction(value);
    if (value.type === "next") setLiked(false);
  }
  function openDialog(value: Dialog) {
    setMenu(false);
    setDialog(value);
  }
  function reset(updateUrl = true) {
    resetSession(updateUrl);
    setDialog(null);
    setTab("queue");
    setMenu(false);
    setLiked(false);
    setJoinCode("");
  }
  return (
    <div className={styles.root}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {resolving ? (
        <RoomEntryLoader />
      ) : !real ? (
        <RoomLanding
          ready={ready}
          error={entryError}
          onCreate={() => openDialog("create")}
          onJoin={() => openDialog("join")}
          onAbout={() => openDialog("about")}
          onSessions={() => openDialog("sessions")}
        />
      ) : (
        <>
          <RoomHeader
            room={room}
            real={real}
            onHome={() => reset(false)}
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
                  This session has ended. Start a new room whenever you’re
                  ready.
                  <button onClick={() => openDialog("create")}>
                    New room
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {real && (
                <RoomWorkspace
                  session={session}
                  tab={tab}
                  liked={liked}
                  onLike={() => setLiked((previous) => !previous)}
                  openDialog={openDialog}
                  onAction={action}
                />
              )}
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
        </>
      )}
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
        onResume={(code) => {
          setDialog(null);
          void openRoom(code);
        }}
        onLeave={async () => {
          if (await leaveSession()) {
            reset();
            return true;
          }
          return false;
        }}
      />
    </div>
  );
}
