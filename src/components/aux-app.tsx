"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Check,
  ChevronUp,
  CircleHelp,
  Copy,
  Disc3,
  DoorOpen,
  Headphones,
  Heart,
  Link2,
  ListMusic,
  Menu,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  catalog,
  demoRoom,
  providers,
  time,
  trackById,
  type Provider,
  type QueueItem,
  type RoomView,
  type Track,
} from "@/lib/catalog";
import { Modal } from "./dialog";
import { SpotifyConnection } from "./spotify-connection";
import { SpotifySearch } from "./spotify-search";
import { HandoffPanel } from "./handoff-panel";
import { LinkedTrackRequest } from "./linked-track-request";
import { providerDefinition } from "@/lib/providers";
type Action = { type: string; trackId?: string; itemId?: string };
type Dialog = "create" | "join" | "invite" | "settings" | "about" | null;
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Couldn’t connect. Please try again.");
  return data as RoomView;
}
function Art({
  track,
  size = 48,
  className = "",
}: {
  track: Track;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={
        track.art.startsWith("https://i.scdn.co/")
          ? track.art
          : `/art/${track.art}.svg`
      }
      width={size}
      height={size}
      alt={
        track.art === "placeholder"
          ? "Shared song artwork placeholder"
          : track.url
            ? `${track.album} cover`
            : `${track.album} — illustrated demo artwork`
      }
      className={`album-art ${className}`}
      unoptimized
    />
  );
}
function ProviderMark({
  provider,
  small = false,
}: {
  provider: Provider;
  small?: boolean;
}) {
  return (
    <span
      className={`provider-mark ${small ? "small" : ""} provider-${providerDefinition(provider).id} ${provider === "Spotify" ? "spotify" : provider === "Apple Music" ? "apple" : provider === "YouTube Music" ? "youtube" : "saavn"}`}
      aria-label={provider}
    >
      {provider === "Spotify" ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 8c5-2 10-1.5 14 .8M6 12c4-1.5 8-1 12 1M7 16c3-1 6-.7 9 1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : provider === "YouTube Music" ? (
        <Play size={small ? 9 : 13} fill="currentColor" />
      ) : (
        <Music2 size={small ? 11 : 15} />
      )}
    </span>
  );
}
export function AuxApp() {
  const [room, setRoom] = useState<RoomView>(demoRoom);
  const [real, setReal] = useState(false);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState("For your ride");
  const [tab, setTab] = useState<"queue" | "discover" | "people">("queue");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [person, setPerson] = useState("");
  const [roomName, setRoomName] = useState("The scenic route");
  const [provider, setProvider] = useState<Provider>("Spotify");
  const [createMode, setCreateMode] = useState<"demo" | "live">("live");
  const [formError, setFormError] = useState("");
  const [now, setNow] = useState(0);
  const [menu, setMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const [searchMobile, setSearchMobile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fetching = useRef(false);
  const mutationVersion = useRef(0);
  const me = room.members.find((m) => m.id === room.me);
  const isHost = me?.host ?? false;
  const live = real && room.mode === "live";
  const manual =
    live && providerDefinition(room.provider).control === "handoff";
  const lookup = (id: string | null) =>
    id ? room.tracks?.[id] || trackById(id) : undefined;
  const current = lookup(room.current);
  const acceptPlayback = useCallback((data: RoomView) => {
    setRoom((previous) => (previous.code === data.code ? data : previous));
  }, []);
  const elapsed =
    room.position +
    (room.playing && room.startedAt
      ? Math.max(0, (now - room.startedAt) / 1000)
      : 0);
  const progress = current
    ? Math.min(100, (elapsed / current.duration) * 100)
    : 0;
  const setActiveRoom = useCallback((data: RoomView) => {
    setRoom(data);
    setReal(true);
    setReady(true);
    localStorage.setItem("aux-room", data.code);
    history.replaceState(null, "", `/?room=${data.code}`);
  }, []);
  useEffect(() => {
    let stopped = false;
    // Restore browser-owned state after hydration without blocking the first paint.
    const bootstrap = window.setTimeout(() => {
      setNow(Date.now());
      const params = new URLSearchParams(location.search);
      if (params.get("spotify") === "connected")
        toast.success(
          "Spotify connected. Open the host’s player and start a song.",
        );
      if (params.get("spotify") === "error")
        toast.error(
          params.get("reason") ||
            "Spotify connection failed. Try connecting again.",
        );
      const code = params.get("room") || localStorage.getItem("aux-room");
      if (!code) {
        setReady(true);
        return;
      }
      api(`/api/rooms/${encodeURIComponent(code)}`)
        .then((data) => {
          if (!stopped) setActiveRoom(data);
        })
        .catch(() => {
          if (!stopped) {
            setJoinCode(code);
            setDialog("join");
            setReady(true);
          }
        });
    }, 0);
    return () => {
      stopped = true;
      window.clearTimeout(bootstrap);
    };
  }, [setActiveRoom]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!real || !ready || room.ended) return;
    let stopped = false;
    const refresh = async () => {
      if (document.hidden || fetching.current) return;
      fetching.current = true;
      const version = mutationVersion.current;
      try {
        const data = await api(`/api/rooms/${room.code}`);
        if (!stopped && version === mutationVersion.current) {
          setRoom(data);
          setOffline(false);
        }
      } catch {
        if (!stopped) setOffline(true);
      } finally {
        fetching.current = false;
      }
    };
    const id = setInterval(refresh, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [real, ready, room.code, room.ended]);
  function openDialog(value: Dialog) {
    setFormError("");
    setMenu(false);
    setDialog(value);
  }
  async function action(a: Action) {
    if (busy || room.ended) return;
    setBusy(true);
    mutationVersion.current++;
    try {
      if (real) {
        const data = await api(`/api/rooms/${room.code}`, "PATCH", a);
        setRoom(data);
        setOffline(false);
      } else {
        const next = structuredClone(room);
        if (a.type === "add") {
          if (next.queue.filter((q) => q.memberId === room.me).length >= 3)
            throw new Error("You have 3 songs queued. Give everyone a turn.");
          if (
            next.queue.some((q) => q.trackId === a.trackId) ||
            next.current === a.trackId
          )
            throw new Error("That song is already in the queue.");
          if (!next.current) next.current = a.trackId!;
          else
            next.queue.push({
              id: crypto.randomUUID(),
              trackId: a.trackId!,
              memberId: room.me,
              votes: [],
            });
        }
        if (a.type === "vote") {
          const item = next.queue.find((q) => q.id === a.itemId)!;
          item.votes = item.votes.includes(room.me)
            ? item.votes.filter((id) => id !== room.me)
            : [...item.votes, room.me];
        }
        if (a.type === "remove")
          next.queue = next.queue.filter((q) => q.id !== a.itemId);
        if (a.type === "promote") {
          const index = next.queue.findIndex((q) => q.id === a.itemId);
          const [item] = next.queue.splice(index, 1);
          next.queue.unshift(item);
        }
        if (a.type === "toggle") {
          if (!next.current) throw new Error("Add a song first.");
          next.position = elapsed;
          next.playing = !next.playing;
          next.startedAt = next.playing ? now : null;
        }
        if (a.type === "next") {
          next.current = next.queue.shift()?.trackId ?? null;
          next.position = 0;
          next.startedAt = next.playing ? now : null;
          if (!next.current) next.playing = false;
          setLiked(false);
        }
        if (a.type === "lock") next.locked = !next.locked;
        if (a.type === "end") {
          next.ended = true;
          next.playing = false;
        }
        setRoom(next);
      }
      if (a.type === "add") toast.success("Added to the ride queue");
      if (live && ["toggle", "next"].includes(a.type))
        toast("Command sent to Spotify. Updating playback shortly.");
      if (a.type === "remove") toast("Request removed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      mutationVersion.current++;
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const data = await api("/api/rooms", "POST", {
        name: roomName,
        person,
        provider,
        mode: createMode,
        seed: false,
      });
      setActiveRoom(data);
      setDialog(null);
      toast.success("Your room is ready. Invite your passengers.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const data = await api(
        `/api/rooms/${joinCode.trim().toUpperCase()}`,
        "POST",
        { name: person },
      );
      setActiveRoom(data);
      setDialog(null);
      toast.success("You’re in. Make yourself heard.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const inviteUrl =
    ready && real
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/?room=${room.code}`
      : "";
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Select and copy the link below.");
    }
  }
  function reset() {
    localStorage.removeItem("aux-room");
    history.replaceState(null, "", "/");
    setReal(false);
    setRoom(demoRoom());
    setDialog(null);
    setTab("queue");
    setQuery("");
  }
  const filtered = catalog.filter(
    (t) =>
      (mood === "For your ride" || t.mood === mood) &&
      `${t.title} ${t.artist} ${t.album}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const totalMinutes = Math.ceil(
    room.queue.reduce((n, q) => n + (lookup(q.trackId)?.duration ?? 0), 0) / 60,
  );
  function songRow(item: QueueItem, index: number) {
    const track = lookup(item.trackId);
    if (!track) return null;
    const member = room.members.find((m) => m.id === item.memberId);
    return (
      <div className="queue-row group" key={item.id}>
        <span className="queue-number">
          {String(index + 1).padStart(2, "0")}
        </span>
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
          {track.duration ? time(track.duration) : "—"}
        </span>
        <button
          className={`vote-button ${item.votes.includes(room.me) ? "voted" : ""}`}
          aria-label={`Vote for ${track.title}`}
          aria-pressed={item.votes.includes(room.me)}
          disabled={busy || room.ended}
          onClick={() => action({ type: "vote", itemId: item.id })}
        >
          <ChevronUp size={14} />
          {item.votes.length}
        </button>
        {(isHost || item.memberId === room.me) && (
          <button
            className="icon-button remove-button"
            aria-label={`Remove ${track.title}`}
            disabled={busy || room.ended}
            onClick={() => action({ type: "remove", itemId: item.id })}
          >
            <X size={14} />
          </button>
        )}
        {isHost && index > 0 && (
          <button
            className="icon-button promote-button"
            aria-label={`Move ${track.title} to next`}
            disabled={busy || room.ended}
            onClick={() => action({ type: "promote", itemId: item.id })}
          >
            <ArrowUp size={14} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <Link className="brand" href="/" aria-label="Aux home">
          <span className="brand-icon">
            <AudioLines size={24} />
          </span>
          aux<span className="brand-period">.</span>
        </Link>
        <div className="sidebar-section-label">YOUR SPACE</div>
        <nav className="space-y-1" aria-label="Main navigation">
          <button
            className={`nav-item ${tab === "queue" ? "selected" : ""}`}
            onClick={() => {
              setTab("queue");
              setMenu(false);
            }}
          >
            <Radio size={18} />
            The ride
            <span className="nav-dot" />
          </button>
          <button
            className={`nav-item ${tab === "discover" ? "selected" : ""}`}
            onClick={() => {
              setTab("discover");
              setMenu(false);
            }}
          >
            <Disc3 size={18} />
            Discover music
          </button>
          <button
            className={`nav-item ${tab === "people" ? "selected" : ""}`}
            onClick={() => {
              setTab("people");
              setMenu(false);
            }}
          >
            <Users size={18} />
            The crew<span className="nav-count">{room.members.length}</span>
          </button>
        </nav>
        <div className="sidebar-room">
          <span className="live-dot" />
          <span>{real ? "YOUR ROOM" : "DEMO ROOM"}</span>
          <strong>{room.name}</strong>
          <div>
            {real ? room.code : "Take it for a spin"}
            <button
              aria-label="Room settings"
              onClick={() => openDialog("settings")}
            >
              <Settings2 size={15} />
            </button>
          </div>
        </div>
        <button
          className="new-room-button"
          onClick={() => openDialog("create")}
        >
          <Plus size={17} />
          Start a new ride
        </button>
        <button className="join-link" onClick={() => openDialog("join")}>
          <Link2 size={15} />
          Join with a code
        </button>
        <div className="sidebar-bottom">
          <div className="little-note">
            <span>
              Good company.
              <br />
              Great soundtrack.
            </span>
            <svg
              width="57"
              height="47"
              viewBox="0 0 57 47"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 32c17 5 21-18 31-18 8 0 7 13-2 11S29 3 48 6m-7-4 8 4-5 8M7 22l-2 15 14-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <button className="help-link" onClick={() => openDialog("about")}>
            <CircleHelp size={16} />A little about aux
            <ArrowRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar" style={{ background: me?.color }}>
              {me?.name[0] || "Y"}
            </span>
            <div>
              <b>{me?.name || "You"}</b>
              <span>{isHost ? "Designated DJ" : "Passenger princess"}</span>
            </div>
            <button
              aria-label="Open settings"
              className="icon-button"
              onClick={() => openDialog("settings")}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="icon-button mobile-menu"
              disabled={!ready}
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Your space <span>/</span>{" "}
              <b>
                {tab === "queue"
                  ? "The ride"
                  : tab === "discover"
                    ? "Discover music"
                    : "The crew"}
              </b>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="prototype-badge">INTERACTIVE PROTOTYPE</span>
            <button className="text-button" onClick={() => openDialog("join")}>
              Join a ride
              <ArrowUp size={14} className="rotate-45" />
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="live-dot" />
                {room.ended
                  ? "RIDE ENDED"
                  : real
                    ? "ROOM IS LIVE"
                    : "A LITTLE LESS “PASS THE AUX”"}
              </div>
              <h1>
                {tab === "queue"
                  ? "Every seat has a say."
                  : tab === "discover"
                    ? "Find your next favorite."
                    : "Your kind of people."}
              </h1>
              <p>
                {tab === "queue"
                  ? "One ride. One queue. A soundtrack made together."
                  : tab === "discover"
                    ? "A little something for every turn in the road."
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
              That was a good ride. Start a new one when you’re ready.
              <button onClick={() => openDialog("create")}>
                New ride
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className="workspace-grid">
            <div className="left-column">
              {tab === "queue" && (
                <>
                  <section className="ride-banner" aria-label="Current room">
                    <div className="banner-grain" />
                    <div className="banner-content">
                      <div className="roadtrip-tag">
                        <span />
                        YOUR COLLECTIVE SOUNDTRACK
                      </div>
                      <h2>{room.name}</h2>
                      <p>Windows down. Volume up. You know the drill.</p>
                      <div className="banner-bottom">
                        <div className="avatar-stack">
                          {room.members.slice(0, 4).map((m) => (
                            <span key={m.id} style={{ background: m.color }}>
                              {m.name[0]}
                            </span>
                          ))}
                        </div>
                        <span>
                          {room.members.length} in the ride
                          {!real && " · sample crew"}
                        </span>
                        <span className="banner-divider" />
                        <span>
                          <ProviderMark provider={room.provider} small />
                          {room.provider}
                        </span>
                      </div>
                    </div>
                    <div className="banner-sticker">
                      <AudioLines size={24} />
                      <span>
                        TAKE THE
                        <br />
                        LONG WAY
                      </span>
                      <span className="sticker-star">✳</span>
                    </div>
                  </section>
                  <section className="queue-section">
                    <div className="section-heading">
                      <div>
                        <h2>
                          {live ? "Crew requests" : "Up next"}{" "}
                          <span className="count-pill">
                            {room.queue.length}
                          </span>
                        </h2>
                        <p>
                          {room.queue.length
                            ? manual
                              ? `${room.queue.length} ${room.queue.length === 1 ? "request" : "requests"} · host-led playback`
                              : `${totalMinutes} min of good company`
                            : "The best rides start with a good song"}
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
                        <span>TRACK</span>
                        <span>ADDED BY</span>
                        <span>TIME</span>
                      </div>
                      {room.queue.map(songRow)}
                      {!room.queue.length && (
                        <div className="empty-state">
                          <ListMusic size={27} />
                          <h3>Your next great song goes here.</h3>
                          <p>Pick something below and get this ride started.</p>
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
                              else searchRef.current?.focus();
                              setSearchMobile(true);
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
                <section className="crew-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Everyone on board{" "}
                        <span className="count-pill">
                          {room.members.length}
                        </span>
                      </h2>
                      <p>
                        {real
                          ? "Your room fits up to 12 music lovers."
                          : "Sample passengers in this demo room."}
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
                  <div className="crew-grid">
                    {room.members.map((m) => (
                      <div key={m.id} className="crew-card">
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
                            : "Passenger · excellent taste"}
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
                <section className="discover-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        {tab === "discover"
                          ? "The good stuff"
                          : "Something for the road"}{" "}
                        <Sparkles
                          size={17}
                          className="inline ml-1 text-stone-500"
                        />
                      </h2>
                      <p>Find a favorite. Make it everyone’s favorite.</p>
                    </div>
                    <span className="catalog-label">CURATED DEMO CATALOG</span>
                  </div>
                  <div
                    className={`search-field ${searchMobile ? "search-focused" : ""}`}
                  >
                    <Search size={18} />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search songs, artists, or albums"
                      aria-label="Search songs"
                      enterKeyHint="search"
                    />
                    {query ? (
                      <button
                        className="icon-button"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={16} />
                      </button>
                    ) : (
                      <span className="search-hint">
                        <Music2 size={14} />
                      </span>
                    )}
                  </div>
                  <div className="mood-tabs" aria-label="Filter songs by mood">
                    {[
                      "For your ride",
                      "Feel good",
                      "Indie ride",
                      "Desi detour",
                      "Throwbacks",
                      "After dark",
                    ].map((m) => (
                      <button
                        key={m}
                        aria-pressed={m === mood}
                        className={m === mood ? "active" : ""}
                        onClick={() => setMood(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div
                    className={
                      tab === "discover" ? "song-grid expanded" : "song-grid"
                    }
                  >
                    {filtered
                      .slice(0, tab === "discover" || query ? 12 : 4)
                      .map((t) => {
                        const added =
                          room.queue.some((q) => q.trackId === t.id) ||
                          room.current === t.id;
                        return (
                          <article className="song-card" key={t.id}>
                            <div className="song-art-wrap">
                              <Art track={t} size={280} />
                              <span className="art-provider">
                                <ProviderMark provider={t.provider} small />
                              </span>
                              <button
                                className={`add-song ${added ? "added" : ""}`}
                                aria-label={
                                  added
                                    ? `${t.title} already queued`
                                    : `Add ${t.title} to queue`
                                }
                                disabled={
                                  added ||
                                  busy ||
                                  room.ended ||
                                  (!isHost && room.locked)
                                }
                                onClick={() =>
                                  action({ type: "add", trackId: t.id })
                                }
                              >
                                {added ? (
                                  <Check size={18} />
                                ) : (
                                  <Plus size={20} />
                                )}
                              </button>
                            </div>
                            <h3 title={t.title}>{t.title}</h3>
                            <p title={t.artist}>{t.artist}</p>
                          </article>
                        );
                      })}
                  </div>
                  {!filtered.length && (
                    <div className="empty-state">
                      <Search size={25} />
                      <h3>No songs found.</h3>
                      <p>Try another artist or choose a different mood.</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setQuery("");
                          setMood("For your ride");
                        }}
                      >
                        Reset search
                      </button>
                    </div>
                  )}
                  <button
                    className="browse-more"
                    onClick={() => {
                      setTab(tab === "discover" ? "queue" : "discover");
                      setQuery("");
                      setMood("For your ride");
                    }}
                  >
                    {tab === "discover"
                      ? "Back to the ride"
                      : "Explore the whole collection"}
                    <ArrowRight size={15} />
                  </button>
                </section>
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
              <section className="now-playing">
                <div className="now-playing-heading">
                  <span>
                    <span
                      className={`live-dot ${room.playing ? "" : "paused"}`}
                    />
                    {manual
                      ? room.orchestration?.hostConfirmed
                        ? "HOST CONFIRMED"
                        : "WAITING FOR HOST"
                      : room.playing
                        ? "NOW PLAYING"
                        : "ON THE DECK"}
                  </span>
                  <Headphones size={15} />
                </div>
                <div className="record-stage">
                  {live && current ? (
                    <Art
                      track={current}
                      size={198}
                      className="live-player-cover"
                    />
                  ) : (
                    <>
                      <div
                        className={`vinyl ${!live && room.playing ? "spinning" : ""}`}
                      >
                        <div className="record-ring" />
                        {current ? (
                          <Art track={current} size={120} />
                        ) : (
                          <span className="empty-record">
                            <AudioLines size={38} />
                          </span>
                        )}
                        <span className="record-pin" />
                      </div>
                    </>
                  )}
                  <span className="record-caption">
                    {live
                      ? `PLAYBACK BY ${room.provider.toUpperCase()}`
                      : "SIDE A · THE OPEN ROAD"}
                  </span>
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
                    <p>
                      {current?.artist || "Add your first song to the queue"}
                    </p>
                  </div>
                  <button
                    className={`icon-button heart ${liked ? "liked" : ""}`}
                    aria-label={
                      liked ? "Unlike current song" : "Like current song"
                    }
                    aria-pressed={liked}
                    onClick={() => {
                      setLiked(!liked);
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
                        live
                          ? "Spotify playback progress"
                          : "Simulated song progress"
                      }
                      aria-valuenow={Math.round(progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="time-labels">
                      <span>
                        {time(Math.min(elapsed, current?.duration ?? 0))}
                      </span>
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
                        onClick={() => action({ type: "toggle" })}
                      >
                        {room.playing ? (
                          <Pause size={21} fill="currentColor" />
                        ) : (
                          <Play
                            size={21}
                            fill="currentColor"
                            className="ml-0.5"
                          />
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
                        onClick={() => action({ type: "next" })}
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
              <section className="invite-card">
                <div className="flex items-start justify-between">
                  <div className="invite-icon">
                    <Users size={20} />
                  </div>
                  <span className="handwritten">room for more ↘</span>
                </div>
                <h2>
                  A good song deserves
                  <br />
                  good company.
                </h2>
                <p>
                  No app downloads for your crew.
                  <br />
                  Just a link and a little taste.
                </p>
                <button
                  className="button dark"
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
                    ROOM CODE <b>{room.code}</b>
                    <Copy size={12} />
                  </button>
                )}
              </section>
              <div className="safety-note">
                <ShieldCheck size={16} />
                <p>
                  {isHost
                    ? "Set the vibe before you drive."
                    : "Keep the driver’s hands on the wheel."}
                  <br />
                  <span>Let the passengers handle the queue.</span>
                </p>
              </div>
            </aside>
          </div>
          <footer className="page-footer">
            <span>Made for the way there.</span>
            <span>
              LESS PHONE PASSING. MORE SINGING ALONG.
              <AudioLines size={14} />
            </span>
          </footer>
        </main>
      </div>
      <Modal
        open={dialog === "create"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Your ride. Everyone’s soundtrack."
        description="Create a room, share the link, and let your crew take turns."
      >
        <form onSubmit={create} className="form-stack">
          <label>
            Your name
            <input
              autoComplete="given-name"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="What should we call you?"
              required
              maxLength={24}
            />
          </label>
          <label>
            Give your ride a name
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              required
              maxLength={60}
              placeholder="The scenic route"
            />
          </label>
          <label className="demo-mode-choice">
            <input
              type="checkbox"
              checked={createMode === "demo"}
              onChange={(e) =>
                setCreateMode(e.target.checked ? "demo" : "live")
              }
            />
            Use demo playback (silent)
          </label>
          <fieldset>
            <legend>
              {createMode === "live"
                ? "Choose the host’s music app"
                : "Preview a playback service"}
            </legend>
            <div className="provider-options">
              {providers.map((p) => (
                <label className={provider === p ? "chosen" : ""} key={p}>
                  <input
                    type="radio"
                    name="provider"
                    aria-label={p}
                    aria-describedby={
                      createMode === "live"
                        ? `provider-${providerDefinition(p).id}-capability`
                        : undefined
                    }
                    value={p}
                    checked={provider === p}
                    onChange={() => setProvider(p)}
                  />
                  <ProviderMark provider={p} />
                  <span>
                    {p}
                    {createMode === "live" && (
                      <small
                        id={`provider-${providerDefinition(p).id}-capability`}
                        className="provider-capability"
                      >
                        {providerDefinition(p).control === "remote"
                          ? "Automatic control"
                          : "Host-led handoff"}
                      </small>
                    )}
                  </span>
                  {provider === p && <Check size={15} />}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-note">
            <Headphones size={16} />
            <span>
              {createMode === "live"
                ? providerDefinition(provider).description
                : "A silent practice room. No music account or subscription is needed."}
            </span>
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button
            disabled={busy}
            className="button primary w-full"
            type="submit"
          >
            {busy ? "Creating your room…" : "Let’s hit the road"}
            <ArrowRight size={17} />
          </button>
        </form>
      </Modal>
      <Modal
        open={dialog === "join"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Hop in. You’re on aux."
        description="Get the six-character code from your host and join the ride."
      >
        <form onSubmit={join} className="form-stack">
          <label>
            Room code
            <input
              className="code-input"
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ""),
                )
              }
              placeholder="A1B2C3"
              minLength={6}
              maxLength={6}
              pattern="[A-Fa-f0-9]{6}"
              required
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Your name
            <input
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="The name behind the good taste"
              required
              maxLength={24}
              autoComplete="given-name"
            />
          </label>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button
            disabled={busy}
            className="button primary w-full"
            type="submit"
          >
            {busy ? "Joining the ride…" : "Join the ride"}
            <ArrowRight size={17} />
          </button>
          <p className="text-xs text-center text-muted">
            No account. No download. Just good music.
          </p>
        </form>
      </Modal>
      <Modal
        open={dialog === "invite"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Pass the link. Keep the aux."
        description="Your friends can scan this code or open the link on their own phone."
      >
        {real && (
          <>
            <div className="qr-wrap">
              <QRCodeSVG
                value={inviteUrl}
                size={172}
                level="M"
                bgColor="#ffffff"
                fgColor="#252722"
                marginSize={1}
              />
            </div>
            <div className="invite-code-display">
              <span>ROOM CODE</span>
              <strong>{room.code}</strong>
            </div>
            <div className="invite-url">
              <input
                aria-label="Room invite link"
                value={inviteUrl}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                aria-label="Copy invite link"
                className="icon-button"
                onClick={copyInvite}
              >
                <Copy size={17} />
              </button>
            </div>
            <button className="button primary w-full mt-4" onClick={copyInvite}>
              <Link2 size={16} />
              Copy invite link
            </button>
            <p className="text-xs text-muted text-center mt-4">
              Rooms stay available for 24 hours. Up to 12 people.
            </p>
          </>
        )}
      </Modal>
      <Modal
        open={dialog === "settings"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Keep the good vibes going."
        description={
          isHost
            ? "A few ground rules for a better ride."
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
            {live
              ? manual
                ? "The host opens each selected track in the music app and confirms playback. Aux cannot pause or stop that app. Ending this ride only closes the shared queue."
                : "Aux owns this queue and controls the host’s active Spotify player. Audio stays in Spotify. Ending the ride stops future dispatch; the current song may finish in Spotify."
              : "This is a demo room with simulated controls. Start a live room to use a music service."}
          </span>
        </div>
        <div className="flex gap-3 mt-6">
          {isHost && !room.ended && (
            <button
              className="button danger flex-1"
              disabled={busy}
              onClick={async () => {
                await action({ type: "end" });
                setDialog(null);
              }}
            >
              End the ride
            </button>
          )}
          <button className="button secondary flex-1" onClick={reset}>
            <DoorOpen size={16} />
            {real ? "Leave view" : "Reset demo"}
          </button>
        </div>
      </Modal>
      <Modal
        open={dialog === "about"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Everyone gets a turn on aux."
        description="Built for the friends who never agree on what to play next."
      >
        <div className="about-steps">
          {[
            [
              "01",
              "Start a ride",
              "Pick a playback service and give your room a name.",
            ],
            [
              "02",
              "Bring your people",
              "Share your room link or six-character code.",
            ],
            [
              "03",
              "Build the soundtrack",
              "Search the connected catalog or share a track link, then vote for favorites.",
            ],
          ].map(([number, title, description]) => (
            <div key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="form-note">
          <Music2 size={18} />
          <span>
            Aux manages queues for eight music services. Spotify supports
            automatic remote control; the other services use explicit host-led
            link handoff. Demo rooms are silent. Cross-service song matching is
            not connected.
          </span>
        </div>
        <button
          className="button primary w-full mt-6"
          onClick={() => openDialog("create")}
        >
          Create your first room
          <ArrowRight size={16} />
        </button>
      </Modal>
    </div>
  );
}
