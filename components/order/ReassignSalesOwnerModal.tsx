"use client";

import { useState } from "react";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

interface Props {
  open: boolean;
  orderId: string;
  currentOwner: string;
  onClose: () => void;
  onSaved: () => void;
}

/** ORDERS_UI.md §5/§6 — Reassign Sales Owner, a small picker over the
 * `salesperson` master data. Created By is never shown or editable here
 * (Spec §6). */
export default function ReassignSalesOwnerModal({ open, orderId, currentOwner, onClose, onSaved }: Props) {
  const [salesOwner, setSalesOwner] = useState(currentOwner);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const salesOwnerOptions = useMasterDataOptions("salesperson", currentOwner);

  if (!open) return null;

  async function handleSave() {
    setError(null);
    if (!salesOwner) {
      setError("Vui lòng chọn người phụ trách");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/reassign-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_owner: salesOwner }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể đổi người phụ trách");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Đổi người phụ trách" onClose={onClose}>
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <Select
        label="Người phụ trách *"
        placeholder="Chọn người phụ trách"
        options={salesOwnerOptions}
        value={salesOwner}
        onChange={(e) => setSalesOwner(e.target.value)}
      />

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
