"use client";
import { useState } from "react";
import { ArrowRight, Check, Headphones } from "lucide-react";

import { toast } from "sonner";
import { errorMessage } from "@/shared/api/http-client";
import { roomRequest } from "../../api/room-client";
import {
  providers,
  type Provider,
  providerDefinition,
} from "../../model/providers";
import type { RoomView } from "../../model/contracts";
import { ProviderMark } from "../music-art";
import { RoomModal } from "./room-modal";
interface CreateRoomDialogProps {
  onClose: () => void;
  onRoomReady: (room: RoomView) => void;
  sessionBusy: boolean;
}
export function CreateRoomDialog({
  onClose,
  onRoomReady: setActiveRoom,
  sessionBusy,
}: CreateRoomDialogProps) {
  const [person, setPerson] = useState("");
  const [roomName, setRoomName] = useState("The listening room");
  const [provider, setProvider] = useState<Provider>("Spotify");
  const [createMode, setCreateMode] = useState<"demo" | "live">("live");
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const busy = sessionBusy || formBusy;
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
      onClose();
      toast.success("Your room is ready. Invite your people.");
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setFormBusy(false);
    }
  }
  return (
    <RoomModal
      onClose={onClose}
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
            onChange={(e) => setCreateMode(e.target.checked ? "demo" : "live")}
          />
          Use demo playback (silent)
        </label>
        <ProviderOptions
          provider={provider}
          createMode={createMode}
          onChange={setProvider}
        />
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
        <button disabled={busy} className="button primary w-full" type="submit">
          {busy ? "Creating your room…" : "Create room"}
          <ArrowRight size={17} />
        </button>
      </form>
    </RoomModal>
  );
}
function ProviderOptions({
  provider,
  createMode,
  onChange,
}: {
  provider: Provider;
  createMode: "demo" | "live";
  onChange: (provider: Provider) => void;
}) {
  return (
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
              onChange={() => onChange(p)}
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
  );
}
