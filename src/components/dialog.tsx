"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="text-2xl font-semibold tracking-tight pr-8">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-sm leading-relaxed text-stone-500 mt-2 mb-6">
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
