"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  /** "complete" = shown right after Complete Follow-up (Feature 4) - next
   * follow-up is optional, so a Skip action is offered. "reschedule" = the
   * standalone Reschedule quick action (Feature 3) - a date is required. */
  mode: "complete" | "reschedule";
  isSaving: boolean;
  onClose: () => void;
  onSave: (date: string, note: string) => void;
}

export default function FollowUpRescheduleModal({ open, mode, isSaving, onClose, onSave }: Props) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  return (
    <Modal
      open={open}
      title={mode === "complete" ? "Đặt lịch chăm sóc tiếp theo?" : "Đổi lịch chăm sóc"}
      onClose={onClose}
      testId="followup-reschedule-modal"
    >
      {mode === "complete" && (
        <p className="text-sm text-muted-foreground mb-4">
          Đã hoàn tất lịch chăm sóc. Bạn có thể đặt lịch tiếp theo ngay hoặc bỏ qua.
        </p>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Ngày follow-up tiếp theo</label>
          <Input
            data-testid="followup-date-input"
            type="date"
            value={date}
            disabled={isSaving}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Ghi chú (không bắt buộc)</label>
          <Input
            data-testid="followup-note-input"
            placeholder="Ghi chú follow-up..."
            value={note}
            disabled={isSaving}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        {mode === "complete" ? (
          <Button data-testid="followup-skip-button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Bỏ qua
          </Button>
        ) : (
          <Button data-testid="followup-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Hủy
          </Button>
        )}
        <Button
          data-testid="followup-save-button"
          variant="primary"
          onClick={() => onSave(date, note.trim())}
          disabled={isSaving || !date}
        >
          Lưu lịch hẹn
        </Button>
      </div>
    </Modal>
  );
}
