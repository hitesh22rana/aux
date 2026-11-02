"use client";
import { DemoDiscovery } from "./demo-discovery";
import styles from "../listening-room.module.css";
import Link from "next/link";
import { useCallback, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Check,
  CircleHelp,
  Copy,
  Disc3,
  Headphones,
  Link2,
  ListMusic,
  Menu,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { SpotifyConnection } from "@/features/listening-room/components/spotify-connection";
import { SpotifySearch } from "@/features/listening-room/components/spotify-search";
import { HandoffPanel } from "@/features/listening-room/components/handoff-panel";
import { LinkedTrackRequest } from "@/features/listening-room/components/linked-track-request";

import { type RoomAction } from "@/features/listening-room/model/contracts";

import { Art } from "@/features/listening-room/components/music-art";
import { QueueRow } from "@/features/listening-room/components/queue-row";
import { NowPlaying } from "@/features/listening-room/components/now-playing";
import { RoomDialogs, type RoomDialog as Dialog } from "./room-dialogs";
import { useRoomSession } from "../hooks/use-room-session";

export function ListeningRoom() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<"queue" | "discover" | "people">("queue");
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
      <header className="app-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Aux home">
            <AudioLines size={26} strokeWidth={1.6} />
            <span>
              aux<span className="brand-period">.</span>
            </span>
          </Link>
          <nav
            className={`main-nav ${menu ? "mobile-open" : ""}`}
            aria-label="Main navigation"
          >
            {(
              [
                ["queue", "The room", Radio],
                ["discover", "Discover music", Disc3],
                ["people", "The people", Users],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                className={`nav-item ${tab === value ? "selected" : ""}`}
                aria-current={tab === value ? "page" : undefined}
                onClick={() => {
                  setTab(value);
                  setMenu(false);
                }}
              >
                <Icon size={16} />
                {label}
                {value === "people" && (
                  <span className="nav-count">{room.members.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <span className="session-kind">
              {real ? "Shared session" : "Silent demo"}
            </span>
            <button
              className="text-button join-action"
              onClick={() => openDialog("join")}
            >
              Join a room
              <ArrowUp size={14} className="rotate-45" />
            </button>
            <button
              className="icon-button"
              aria-label="Open settings"
              onClick={() => openDialog("settings")}
            >
              <Settings2 size={18} />
            </button>
            <button
              className="mobile-menu icon-button"
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              onClick={() => setMenu((previous) => !previous)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>
      <div className="main-shell">
        <main id="main" className="main-content">
          <div className="page-heading">
            <div>
              <h1>
                {tab === "queue"
                  ? room.name
                  : tab === "discover"
                    ? "Discover music"
                    : "The people"}
              </h1>
              <p>
                {tab === "queue"
                  ? real
                    ? "Your people. Their picks. One shared soundtrack."
                    : "Everyone gets a say. Try the silent demo or start a shared session."
                  : tab === "discover"
                    ? "A little something for every mood and moment."
                    : "Different tastes. One very good soundtrack."}
              </p>
            </div>
            <button
              className="button primary invite-heading"
              disabled={!ready}
              onClick={() => openDialog(real ? "invite" : "create")}
            >
              <Plus size={17} />
              {real ? "Invite friends" : "Create a room"}
            </button>
          </div>
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
                <button
                  className="mobile-now-playing"
                  onClick={() =>
                    document.getElementById("current-player")?.scrollIntoView({
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "auto"
                        : "smooth",
                      block: "start",
                    })
                  }
                >
                  <Art track={current} size={44} />
                  <span>
                    <b>{current.title}</b>
                    <small>
                      {manual
                        ? "Host confirmed"
                        : room.playing
                          ? "Now playing"
                          : "On the deck"}{" "}
                      · {current.artist}
                    </small>
                  </span>
                  <ArrowDown size={17} />
                </button>
              )}
              {tab === "queue" && (
                <>
                  <section className="room-summary" aria-label="Current room">
                    <div className="room-members">
                      <div className="avatar-stack">
                        {room.members.slice(0, 4).map((member) => (
                          <span
                            key={member.id}
                            style={{ background: member.color }}
                          >
                            {member.name[0]}
                          </span>
                        ))}
                      </div>
                      <span>
                        {room.members.length} in the room
                        {!real && " · sample group"}
                      </span>
                    </div>
                    <div className="summary-detail">
                      <Headphones size={15} />
                      <span>{live ? room.provider : "Demo playback"}</span>
                    </div>
                    <span className="summary-status">
                      <span
                        className={`live-dot ${room.ended ? "paused" : ""}`}
                      />
                      {room.ended
                        ? "Session ended"
                        : real
                          ? "Room is live"
                          : "No audio streamed"}
                    </span>
                    <button
                      className="text-button"
                      aria-label="Room settings"
                      onClick={() => openDialog("settings")}
                    >
                      <Settings2 size={15} />
                      Room settings
                    </button>
                  </section>
                  <section className="queue-section">
                    <div className="section-heading">
                      <div>
                        <h2>
                          {live ? "Song requests" : "Up next"}{" "}
                          <span className="count-pill">
                            {room.queue.length}
                          </span>
                        </h2>
                        <p>
                          {room.queue.length
                            ? manual
                              ? `${room.queue.length} ${room.queue.length === 1 ? "request" : "requests"} · host-led playback`
                              : `${totalMinutes} min of good company`
                            : "Add a song to get the session started"}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => openDialog("settings")}
                      >
                        <Settings2 size={15} />
                        <span>Queue settings</span>
                      </button>
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
                            onAction={action}
                          />
                        ) : null;
                      })}
                      {!room.queue.length && (
                        <div className="empty-state">
                          <ListMusic size={27} />
                          <h3>Your next great song goes here.</h3>
                          <p>
                            Pick something below and get this session started.
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              if (live)
                                document
                                  .getElementById(
                                    manual
                                      ? "linked-song-url"
                                      : "spotify-search",
                                  )
                                  ?.focus();
                              else
                                document
                                  .getElementById("demo-song-search")
                                  ?.focus();
                            }}
                          >
                            Find a song
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      )}
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
                </>
              )}
              {tab === "people" ? (
                <section className="members-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Everyone in the room{" "}
                        <span className="count-pill">
                          {room.members.length}
                        </span>
                      </h2>
                      <p>
                        {real
                          ? "Your room fits up to 12 music lovers."
                          : "Sample listeners in this demo room."}
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => openDialog(real ? "invite" : "create")}
                    >
                      <Plus size={16} />
                      Invite
                    </button>
                  </div>
                  <div className="members-grid">
                    {room.members.map((m) => (
                      <div key={m.id} className="member-card">
                        <span
                          className="avatar large"
                          style={{ background: m.color }}
                        >
                          {m.name[0]}
                        </span>
                        <h3>
                          {m.name}
                          {m.id === room.me ? " (you)" : ""}
                        </h3>
                        <p>
                          {m.host
                            ? "Host · keeper of the aux"
                            : "Member · excellent taste"}
                        </p>
                        <span>
                          {room.queue.filter((q) => q.memberId === m.id).length}{" "}
                          songs queued
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
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
              <section className="invite-card">
                <h2>Better with your people.</h2>
                <p>
                  Send a link. Let everyone add something worth listening to.
                </p>
                <button
                  className="button secondary w-full"
                  onClick={() => openDialog(real ? "invite" : "create")}
                >
                  <Link2 size={16} />
                  {real ? "Share the aux" : "Start your own room"}
                  <ArrowRight size={15} />
                </button>
                {real && (
                  <button
                    className="room-code"
                    onClick={() => openDialog("invite")}
                  >
                    Room code <b>{room.code}</b>
                    <Copy size={14} />
                  </button>
                )}
              </section>
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
