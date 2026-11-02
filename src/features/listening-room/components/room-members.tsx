"use client";

import { useState } from "react";
import { UserRoundMinus } from "lucide-react";
import { MemberAvatar } from "@/shared/ui/member-avatar";
import styles from "../listening-room.module.css";
import { Modal } from "@/shared/ui/dialog";
import type { RoomAction, RoomView } from "../model/contracts";

export function RoomMembers({
  room,
  busy,
  onAction,
}: {
  room: RoomView;
  busy: boolean;
  onAction: (action: RoomAction) => Promise<void>;
}) {
  const members = room.members.filter((member) => !member.leftAt);
  const host = members.some((member) => member.id === room.me && member.host);
  const [removing, setRemoving] = useState<string | null>(null);
  const target = members.find((member) => member.id === removing);
  return (
    <section className="members-section">
      <div className="section-heading">
        <div>
          <h2>
            Everyone in the room{" "}
            <span className="count-pill">{members.length}</span>
          </h2>
          <p>
            {members.filter((member) => member.active).length} active ·{" "}
            {members.length} joined. Saved sessions show as away when
            disconnected.
          </p>
        </div>
      </div>
      <div className="members-grid">
        {members.map((member) => (
          <article key={member.id} className="member-card">
            <div className="member-avatar-wrap">
              <MemberAvatar name={member.name} size={48} />
              <span
                className={`member-status-dot ${member.active ? "active" : "away"}`}
                role="img"
                aria-label={member.active ? "Active now" : "Away"}
              />
            </div>
            <div className="member-details">
              <div className="member-name-row">
                <h3 title={member.name}>
                  {member.name}
                  {member.id === room.me ? " (you)" : ""}
                </h3>
              </div>
              <p>{member.host ? "Host" : "Member"}</p>
              <span>
                {
                  room.queue.filter((item) => item.memberId === member.id)
                    .length
                }{" "}
                songs queued
              </span>
            </div>
            {host && !member.host && !room.ended && (
              <button
                className="icon-button member-remove"
                aria-label={`Remove ${member.name} from room`}
                disabled={busy}
                onClick={() => setRemoving(member.id)}
              >
                <UserRoundMinus size={16} />
              </button>
            )}
          </article>
        ))}
      </div>
      <Modal
        contentClassName={styles.root}
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove from room?"
        description={`${target?.name ?? "This member"} will lose access to this session. Their accepted song requests stay in the queue.`}
      >
        <div className="member-remove-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !target}
            onClick={async () => {
              if (target) await onAction({ type: "kick", memberId: target.id });
              setRemoving(null);
            }}
          >
            Remove member
          </button>
        </div>
      </Modal>
    </section>
  );
}
