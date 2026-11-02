"use client";
import { useState } from "react";
import { Check, ExternalLink, Headphones, ListMusic, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { requestJson, errorMessage } from "@/shared/api/http-client";
import { roomViewSchema } from "@/features/listening-room/model/contracts";
const handoffResponseSchema = z.union([
  roomViewSchema,
  z.object({ room: roomViewSchema }),
]);
import type { RoomView } from "@/features/listening-room/model/catalog";
import { providerDefinition } from "@/features/listening-room/model/providers";
export function HandoffPanel({
  room,
  onUpdate,
}: {
  room: RoomView;
  onUpdate: (room: RoomView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const host = room.members.some((m) => m.id === room.me && m.host);
  const definition = providerDefinition(room.provider);
  const pending = room.orchestration?.handoff;
  const selected = room.queue.find((q) => q.id === pending?.itemId);
  const track = selected && room.tracks?.[selected.trackId];
  async function command(type: "prepare" | "confirm" | "cancel" | "finish") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await requestJson(
        `/api/rooms/${room.code}/handoff`,
        handoffResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            ...(type === "confirm" || type === "cancel"
              ? { selectionId: pending?.id }
              : {}),
          }),
        },
      );
      onUpdate("room" in data ? data.room : data);
      if (type === "confirm") toast.success("Playback confirmed by the host");
      if (type === "cancel")
        toast("Selection cancelled. The request stays in Aux.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="spotify-connection handoff-panel"
      aria-label={`${room.provider} handoff`}
    >
      <div className="flex items-center gap-2">
        <Headphones size={17} />
        <h2>{room.provider}</h2>
        <span className="handoff-badge">Host-led</span>
      </div>
      <p>{definition.description}</p>
      <div className="handoff-explainer">
        Aux manages your queue. The host opens each song and confirms playback.
        No automatic play, pause, or completion detection.
      </div>
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
      {!host ? (
        <p>Waiting for the host to open the next request.</p>
      ) : room.ended ? (
        <p>This session has ended.</p>
      ) : pending && track ? (
        <div className="handoff-selection">
          <span className="delivery-status">Selected request</span>
          <h3>{track.title}</h3>
          <p>{track.artist}</p>
          <a
            className="button primary w-full"
            href={track.url}
            target="_blank"
            rel="noreferrer"
          >
            Open in {room.provider}
            <ExternalLink size={14} />
          </a>
          <p className="handoff-confirm-note">
            Return here after starting the song. Opening the link alone does not
            confirm playback.
          </p>
          <button
            className="button secondary w-full"
            disabled={busy}
            onClick={() => command("confirm")}
          >
            <Check size={15} />I started this song
          </button>
          <button
            className="text-button w-full mt-3"
            disabled={busy}
            onClick={() => command("cancel")}
          >
            <X size={14} />
            Cancel selection
          </button>
        </div>
      ) : (
        <div className="connection-buttons">
          <button
            className="button primary"
            disabled={busy || !room.queue.length}
            onClick={() => command("prepare")}
          >
            <ListMusic size={15} />
            Select next request
          </button>
          {room.orchestration?.hostConfirmed && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => command("finish")}
            >
              Mark current finished
            </button>
          )}
        </div>
      )}
      <small>
        No login to the music service is required by Aux. Its app may require
        sign-in, a subscription, or an extra tap to play.
      </small>
    </section>
  );
}
