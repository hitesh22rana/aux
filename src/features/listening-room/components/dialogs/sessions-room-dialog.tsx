"use client";
import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { requestJson, errorMessage } from "@/shared/api/http-client";
import { sessionsSchema, type SavedSession } from "../../model/contracts";
import { RoomModal } from "./room-modal";

type State =
  | { status: "loading" }
  | { status: "ready"; sessions: SavedSession[] }
  | { status: "error"; message: string };
export function SessionsRoomDialog({
  onClose,
  onResume,
}: {
  onClose: () => void;
  onResume: (code: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    requestJson("/api/rooms", sessionsSchema, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ status: "ready", sessions: data.sessions });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, []);
  return (
    <RoomModal
      onClose={onClose}
      title="Your sessions"
      description="Rooms you can return to from this browser. Going home keeps your membership; leaving a room removes it."
    >
      {state.status === "loading" && (
        <p role="status" className="sessions-status">
          <LoaderCircle size={18} /> Finding your sessions…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="form-error">
          {state.message}
        </p>
      )}
      {state.status === "ready" &&
        (state.sessions.length ? (
          <ul className="saved-sessions">
            {state.sessions.map((session) => (
              <li key={session.code}>
                <button
                  onClick={() => onResume(session.code)}
                  aria-label={`Resume ${session.name}`}
                >
                  <span>
                    <strong>{session.name}</strong>
                    <small>
                      {session.host ? "Host" : "Member"} · {session.provider} ·{" "}
                      {session.code}
                    </small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sessions-status">
            No active sessions in this browser. Create a room or join with an
            invite.
          </p>
        ))}
    </RoomModal>
  );
}
