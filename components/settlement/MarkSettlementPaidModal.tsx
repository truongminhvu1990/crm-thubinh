"use client";

import { useEffect, useState } from "react";
import { getReceivingAccountOptions, ReceivingAccountOption } from "@/lib/receivingAccount.service";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

interface Props {
  open: boolean;
  settlementId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Finance Project #1, Phase A (Product Owner Approval, 2026-08-21) —
 * Completed -> Paid. Requires payment_reference + receiving_account_id,
 * proving the transition beyond a bare status flip. Mirrors
 * AddPaymentModal's own Receiving Account picker (same getReceivingAccountOptions
 * source, same Select usage). */
export default function MarkSettlementPaidModal({ open, settlementId, onClose, onSaved }: Props) {
  const [paymentReference, setPaymentReference] = useState("");
  const [receivingAccountId, setReceivingAccountId] = useState("");
  const [receivingAccountOptions, setReceivingAccountOptions] = useState<ReceivingAccountOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getReceivingAccountOptions()
      .then(setReceivingAccountOptions)
      .catch(() => setReceivingAccountOptions([]));
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    setError(null);

    if (!paymentReference.trim()) {
      setError("Vui lòng nhập payment reference");
      return;
    }
    if (!receivingAccountId) {
      setError("Vui lòng chọn tài khoản nhận tiền");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/settlements/${settlementId}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_reference: paymentReference.trim(),
          receiving_account_id: receivingAccountId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể đánh dấu đã thanh toán");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Đánh dấu đã thanh toán" onClose={onClose} testId="settlement-mark-paid-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="space-y-4">
        <Input
          data-testid="settlement-payment-reference-input"
          label="Payment reference *"
          placeholder="Số tham chiếu giao dịch"
          value={paymentReference}
          onChange={(e) => setPaymentReference(e.target.value)}
        />
        <Select
          data-testid="settlement-receiving-account-select"
          label="Tài khoản nhận tiền *"
          placeholder="Chọn tài khoản nhận tiền"
          options={receivingAccountOptions.map((o) => ({ value: o.id, label: o.label }))}
          value={receivingAccountId}
          onChange={(e) => setReceivingAccountId(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="settlement-mark-paid-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button data-testid="settlement-mark-paid-save-button" onClick={handleSave} isLoading={isSaving}>
          Xác nhận đã thanh toán
        </Button>
      </div>
    </Modal>
  );
}
