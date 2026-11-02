"use client";

import { Copy, Link2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import type { RoomView } from "../../model/contracts";

import { RoomModal } from "./room-modal";
export function InviteRoomDialog({
  onClose,
  room,
}: {
  onClose: () => void;
  room: RoomView;
}) {
  const inviteUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/?room=${room.code}`;
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Select and copy the link below.");
    }
  }
  return (
    <RoomModal
      onClose={onClose}
      title="Pass the link. Keep the aux."
      description="Your friends can scan this code or open the link on their own phone."
    >
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
    </RoomModal>
  );
}
