"use client";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  DoorOpen,
  Headphones,
  Link2,
  ListMusic,
  Music2,
  ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import styles from "../listening-room.module.css";
import { Modal } from "@/shared/ui/dialog";
import { errorMessage } from "@/shared/api/http-client";
import { roomRequest } from "../api/room-client";
import {
  providers,
  type Provider,
  providerDefinition,
} from "../model/providers";

import type { RoomView, RoomAction } from "../model/contracts";
import { ProviderMark } from "./music-art";
export type RoomDialog =
  "create" | "join" | "invite" | "settings" | "about" | null;
interface RoomDialogsProps {
  dialog: RoomDialog;
  onDialogChange: (dialog: RoomDialog) => void;
  initialJoinCode: string;
  room: RoomView;
  real: boolean;
  ready: boolean;
  isHost: boolean;
  live: boolean;
  manual: boolean;
  sessionBusy: boolean;
  onRoomReady: (room: RoomView) => void;
  onAction: (action: RoomAction) => Promise<void>;
  onReset: () => void;
}
export function RoomDialogs({
  dialog,
  onDialogChange: setDialog,
  initialJoinCode,
  room,
  real,
  ready,
  isHost,
  live,
  manual,
  sessionBusy,
  onRoomReady: setActiveRoom,
  onAction: action,
  onReset: reset,
}: RoomDialogsProps) {
  const [person, setPerson] = useState("");
  const [roomName, setRoomName] = useState("The listening room");
  const [provider, setProvider] = useState<Provider>("Spotify");
  const [createMode, setCreateMode] = useState<"demo" | "live">("live");
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const busy = sessionBusy || formBusy;
  function openDialog(value: RoomDialog) {
    setFormError("");
    setDialog(value);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError("");
    try {
      const data = await roomRequest("/api/rooms", "POST", {
        name: roomName,
        person,
        provider,
        mode: createMode,
        seed: false,
      });
      setActiveRoom(data);
      setDialog(null);
      toast.success("Your room is ready. Invite your people.");
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setFormBusy(false);
    }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError("");
    try {
      const data = await roomRequest(
        `/api/rooms/${joinCode.trim().toUpperCase()}`,
        "POST",
        { name: person },
      );
      setActiveRoom(data);
      setDialog(null);
      toast.success("You’re in. Make yourself heard.");
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setFormBusy(false);
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
  return (
    <>
      <Modal
        contentClassName={styles.root}
        open={dialog === "create"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Start a listening room."
        description="Create a room, share the link, and let everyone take turns."
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
            Give your room a name
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              required
              maxLength={60}
              placeholder="The listening room"
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
            {busy ? "Creating your room…" : "Create room"}
            <ArrowRight size={17} />
          </button>
        </form>
      </Modal>
      <Modal
        contentClassName={styles.root}
        open={dialog === "join"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Join the listening room."
        description="Get the six-character code from your host and join the room."
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
            {busy ? "Joining the room…" : "Join the room"}
            <ArrowRight size={17} />
          </button>
          <p className="text-xs text-center text-muted">
            No account. No download. Just good music.
          </p>
        </form>
      </Modal>
      <Modal
        contentClassName={styles.root}
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
        contentClassName={styles.root}
        open={dialog === "settings"}
        onOpenChange={(o) => !o && setDialog(null)}
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
            {live
              ? manual
                ? "The host opens each selected track in the music app and confirms playback. Aux cannot pause or stop that app. Ending this session only closes the shared queue."
                : "Aux owns this queue and controls the host’s active Spotify player. Audio stays in Spotify. Ending the session stops future dispatch; the current song may finish in Spotify."
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
              End the session
            </button>
          )}
          <button className="button secondary flex-1" onClick={reset}>
            <DoorOpen size={16} />
            {real ? "Leave view" : "Reset demo"}
          </button>
        </div>
      </Modal>
      <Modal
        contentClassName={styles.root}
        open={dialog === "about"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Everyone gets a turn on aux."
        description="Built for the friends who never agree on what to play next."
      >
        <div className="about-steps">
          {[
            [
              "Start a room",
              "Pick a playback service and give your room a name.",
            ],
            [
              "Bring your people",
              "Share your room link or six-character code.",
            ],
            [
              "Build the soundtrack",
              "Search the connected catalog or share a track link, then vote for favorites.",
            ],
          ].map(([title, description]) => (
            <div key={title}>
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
            Aux brings everyone into one shared queue across multiple music
            services. Playback options depend on the selected app: automatic
            control where available, or host-led handoff. Demo rooms are silent.
            Cross-service song matching is not connected.
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
    </>
  );
}
