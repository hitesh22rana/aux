"use client";
import styles from "./dialog.module.css";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.content} ${contentClassName ?? ""}`}
        >
          <Dialog.Title className={`${styles.title} pr-8`}>
            {title}
          </Dialog.Title>
          <Dialog.Description className={styles.description}>
            {description}
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close dialog"
            className="icon-button absolute top-4 right-4"
          >
            <X size={19} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
