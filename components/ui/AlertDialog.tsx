"use client";

import * as RadixAlertDialog from "@radix-ui/react-alert-dialog";
import Button from "./Button";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel?: () => void;
  onOpenChange: (open: boolean) => void;
}

export default function AlertDialog({
  open,
  title,
  description,
  confirmLabel = "Xóa",
  cancelLabel = "Hủy",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  onOpenChange,
}: Props) {
  return (
    <RadixAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <RadixAlertDialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
            rounded-xl border border-border bg-card p-6 shadow-xl
            data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95
            data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
        >
          <RadixAlertDialog.Title className="text-lg font-semibold text-foreground">
            {title}
          </RadixAlertDialog.Title>
          {description && (
            <RadixAlertDialog.Description className="text-sm text-muted-foreground mt-2">
              {description}
            </RadixAlertDialog.Description>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <RadixAlertDialog.Cancel asChild>
              <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
            </RadixAlertDialog.Cancel>
            <RadixAlertDialog.Action asChild>
              <Button variant={confirmVariant} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </RadixAlertDialog.Action>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  );
}
