"use client";
import { RoomTimeRemaining } from "./room-time-remaining";
import Link from "next/link";
import { MemberAvatarGroup } from "@/shared/ui/member-avatar-group";
import { ThemeToggle } from "@/shared/theme/theme-toggle";
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Copy,
  Disc3,
  Headphones,
  Link2,
  Menu,
  Plus,
  Radio,
  Settings2,
  Users,
  X,
} from "lucide-react";
import type { RoomView, Track } from "../model/contracts";
import type { RoomDialog } from "./room-dialogs";
import { Art } from "./music-art";

export type RoomTab = "queue" | "discover" | "people";
interface RoomHeaderProps {
  room: RoomView;
  real: boolean;
  tab: RoomTab;
  menu: boolean;
  onTabChange: (tab: RoomTab) => void;
  onToggleMenu: () => void;
  onHome: () => void;
  openDialog: (dialog: RoomDialog) => void;
}
export function RoomHeader({
  room,
  real,
  tab,
  menu,
  onTabChange,
  onToggleMenu,
  onHome,
  openDialog,
}: RoomHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand" href="/" onClick={onHome} aria-label="Aux home">
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
              ["queue", "Room", Radio],
              ["discover", "Discover music", Disc3],
              ["people", "People", Users],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              className={`nav-item ${tab === value ? "selected" : ""}`}
              aria-current={tab === value ? "page" : undefined}
              onClick={() => {
                onTabChange(value);
              }}
            >
              <Icon size={16} />
              {label}
              {value === "people" && (
                <span className="nav-count">
                  {room.members.filter((member) => !member.leftAt).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          {real && !room.ended && (
            <button
              className="text-button room-settings-action"
              aria-label="Room settings"
              onClick={() => openDialog("settings")}
            >
              <Settings2 size={18} />
              <span>Room settings</span>
            </button>
          )}
          <ThemeToggle />
          <button
            className="mobile-menu icon-button"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={onToggleMenu}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
export function RoomHeading({
  room,
  real,
  ready,
  tab,
  openDialog,
}: {
  room: RoomView;
  real: boolean;
  ready: boolean;
  tab: RoomTab;
  openDialog: (dialog: RoomDialog) => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>
          {tab === "queue"
            ? room.name
            : tab === "discover"
              ? "Discover music"
              : "People"}
        </h1>
        <p>
          {tab === "queue"
            ? real
              ? "Your people. Their picks. One shared soundtrack."
              : "Create a room or join your people. Everyone gets a say."
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
  );
}
export function MobilePlayerSummary({
  current,
  manual,
  room,
}: {
  current: Track;
  manual: boolean;
  room: RoomView;
}) {
  return (
    <button
      className="mobile-now-playing"
      onClick={() =>
        document.getElementById("current-player")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
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
  );
}
export function RoomSummary({ room }: { room: RoomView }) {
  return (
    <section className="room-summary" aria-label="Current room">
      <MemberAvatarGroup
        members={room.members.filter((member) => !member.leftAt)}
      />
      <div className="summary-detail">
        <Headphones size={15} />
        <span>{room.provider}</span>
      </div>
      {room.ended && <span className="summary-status">Session ended</span>}
    </section>
  );
}
export function RoomInviteCard({
  real,
  room,
  openDialog,
}: {
  real: boolean;
  room: RoomView;
  openDialog: (dialog: RoomDialog) => void;
}) {
  return (
    <section className="invite-card">
      <h2>Better with your people.</h2>
      <p>Send a link. Let everyone add something worth listening to.</p>
      <button
        className="button secondary w-full"
        onClick={() => openDialog(real ? "invite" : "create")}
      >
        <Link2 size={16} />
        {real ? "Share the aux" : "Start your own room"}
        <ArrowRight size={15} />
      </button>
      {real && (
        <div className="invite-meta">
          <button
            className="room-code"
            onClick={() => openDialog("invite")}
            aria-label={`Room code ${room.code}. Copy or share invite`}
          >
            <span>Room code</span> <b>{room.code}</b>
            <Copy size={12} />
          </button>
          <span className="room-time">
            <RoomTimeRemaining
              createdAt={room.createdAt}
              ended={room.ended}
              compact
            />
          </span>
        </div>
      )}
    </section>
  );
}
