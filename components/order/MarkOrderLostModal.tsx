"use client";

import { useState } from "react";
import { LOST_REASON_OPTIONS } from "@/lib/orders/order.constants";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

interface Props {
  open: boolean;
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** ORDERS_UI.md §10 — Lost Order Flow. Confirm button stays disabled until a
 * reason is chosen (Spec §4); a warning line states the inventory
 * consequence before confirming. */
export default function MarkOrderLostModal({ open, orderId, onClose, onSaved }: Props) {
  const [lostReason, setLostReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/lost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lost_reason: lostReason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể đánh dấu Lost");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Đánh dấu đơn hàng Lost" onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-4">
        Tất cả sản phẩm trong đơn sẽ được chuyển lại về trạng thái Có sẵn.
      </p>

      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <Select
        label="Lý do *"
        placeholder="Chọn lý do"
        options={LOST_REASON_OPTIONS}
        value={lostReason}
        onChange={(e) => setLostReason(e.target.value)}
      />

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button variant="danger" onClick={handleConfirm} isLoading={isSaving} disabled={!lostReason}>
          Đánh dấu Lost
        </Button>
      </div>
    </Modal>
  );
}
