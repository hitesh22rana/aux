"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { toast } from "sonner";
import { errorMessage } from "@/shared/api/http-client";
import { roomRequest } from "../../api/room-client";

import type { RoomView } from "../../model/contracts";

import { RoomModal } from "./room-modal";
interface JoinRoomDialogProps {
  onClose: () => void;
  onRoomReady: (room: RoomView) => void;
  sessionBusy: boolean;
  initialJoinCode: string;
}
export function JoinRoomDialog({
  onClose,
  onRoomReady: setActiveRoom,
  sessionBusy,
  initialJoinCode,
}: JoinRoomDialogProps) {
  const [person, setPerson] = useState("");
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const busy = sessionBusy || formBusy;
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
      onClose();
      toast.success("You’re in. Make yourself heard.");
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setFormBusy(false);
    }
  }
  return (
    <RoomModal
      onClose={onClose}
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
        <button disabled={busy} className="button primary w-full" type="submit">
          {busy ? "Joining the room…" : "Join the room"}
          <ArrowRight size={17} />
        </button>
        <p className="text-xs text-center text-muted">
          No account. No download. Just good music.
        </p>
      </form>
    </RoomModal>
  );
}
