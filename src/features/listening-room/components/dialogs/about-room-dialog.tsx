"use client";

import { ArrowRight, Music2 } from "lucide-react";

import { RoomModal } from "./room-modal";
export function AboutRoomDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <RoomModal
      onClose={onClose}
      title="Everyone gets a turn on aux."
      description="Built for the friends who never agree on what to play next."
    >
      <div className="about-steps">
        {[
          [
            "Start a room",
            "Pick a playback service and give your room a name.",
          ],
          ["Bring your people", "Share your room link or six-character code."],
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
      <button className="button primary w-full mt-6" onClick={onCreate}>
        Create your first room
        <ArrowRight size={16} />
      </button>
    </RoomModal>
  );
}
