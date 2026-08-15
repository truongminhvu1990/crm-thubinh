"use client";

import { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** QA Test IDs Foundation - stable selector for this specific modal instance (e.g. "customer-modal"). */
  testId?: string;
  /** "md" (default, max-w-lg) - the size every existing caller already gets.
   * "xl" (max-w-5xl) - for content a form-sized modal can't hold, e.g. a
   * multi-column drill-down table (Payment Method Report drill-down,
   * 2026-08-14). */
  size?: "md" | "xl";
}

export default function Modal({ open, title, children, onClose, testId, size = "md" }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          data-testid={testId}
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] ${size === "xl" ? "max-w-5xl" : "max-w-lg"}
            max-h-[85dvh] overflow-y-auto overscroll-contain
            rounded-xl border border-border bg-card p-6 shadow-xl
            data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95
            data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95`}
        >
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-xl font-semibold text-foreground">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                data-testid={testId ? `${testId}-close-button` : undefined}
                className="text-muted-foreground hover:text-destructive transition-colors rounded-md p-3 -m-2 touch-manipulation"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
