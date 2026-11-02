"use client";
import type { ComponentProps } from "react";
import { Modal } from "@/shared/ui/dialog";
import styles from "../../listening-room.module.css";
type RoomModalProps = Omit<
  ComponentProps<typeof Modal>,
  "open" | "onOpenChange" | "contentClassName"
> & { onClose: () => void };
export function RoomModal({ onClose, ...props }: RoomModalProps) {
  return (
    <Modal
      {...props}
      open
      contentClassName={styles.root}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}
