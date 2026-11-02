"use client";

import { Plus } from "lucide-react";
import type { RoomView } from "../model/contracts";
import type { RoomDialog } from "./room-dialogs";

export function RoomMembers({
  room,
  real,
  openDialog,
}: {
  room: RoomView;
  real: boolean;
  openDialog: (dialog: RoomDialog) => void;
}) {
  return (
    <section className="members-section">
      <div className="section-heading">
        <div>
          <h2>
            Everyone in the room{" "}
            <span className="count-pill">{room.members.length}</span>
          </h2>
          <p>
            {real
              ? "Your room fits up to 12 music lovers."
              : "Invite people to start listening together."}
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
            <span className="avatar large" style={{ background: m.color }}>
              {m.name[0]}
            </span>
            <h3>
              {m.name}
              {m.id === room.me ? " (you)" : ""}
            </h3>
            <p>
              {m.host ? "Host · keeper of the aux" : "Member · excellent taste"}
            </p>
            <span>
              {room.queue.filter((q) => q.memberId === m.id).length} songs
              queued
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
