"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { formatDate } from "@/lib/utils";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

interface Counterparty {
  id: string;
  name: string;
  partner_type: string;
}

interface TechHCandidate {
  id: string;
  amount: number;
  payment_date: string;
  remaining: number;
  order?: { order_number: string; customer?: { full_name: string } | null } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §12 — reconciles a TECH_H Payment
 * (payments.payment_method = 'TECH_H') to the downstream VND movement it
 * represents. Payment stays the source of truth (D9) — this only creates a
 * linked 'Customer Payment TECH_H' ledger row; nothing about the Payment
 * itself is touched. Only outstanding (not-yet-fully-reconciled) payments
 * are offered, and the amount field is capped at the remaining balance —
 * the server-side guard in create_money_debt_ledger_entry() is the
 * authoritative check either way. */
export default function TechHReconcileModal({ open, onClose, onSaved }: Props) {
  const [candidates, setCandidates] = useState<TechHCandidate[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [paymentId, setPaymentId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/money-debt-ledger/tech-h-candidates").then((res) => res.json()),
      fetch("/api/money-debt-ledger/counterparties").then((res) => res.json()),
    ])
      .then(([paymentRows, partyRows]: [TechHCandidate[], Counterparty[]]) => {
        setCandidates(paymentRows);
        setCounterparties(partyRows.filter((p) => p.partner_type === "Money Changer"));
      })
      .catch(() => {
        setCandidates([]);
        setCounterparties([]);
      });
  }, [open]);

  const selectedPayment = candidates.find((p) => p.id === paymentId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived-field sync, not an external-system subscription
    if (selectedPayment) setAmount(selectedPayment.remaining);
  }, [selectedPayment]);

  if (!open) return null;

  const paymentOptions = candidates.map((p) => ({
    value: p.id,
    label: `${p.order?.order_number ?? "—"} · ${p.order?.customer?.full_name ?? ""} · còn ${vnd.format(p.remaining)}`,
  }));
  const partyOptions = counterparties.map((p) => ({ value: p.id, label: p.name }));

  async function handleSave() {
    setError(null);
    if (!paymentId || !selectedPayment) {
      setError("Vui lòng chọn Payment TECH_H cần đối soát");
      return;
    }
    if (!partyId) {
      setError("Vui lòng chọn Money Changer nhận tiền");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Số tiền phải lớn hơn 0");
      return;
    }
    if (amount > selectedPayment.remaining) {
      setError(`Số tiền vượt quá số dư chưa đối soát (còn ${vnd.format(selectedPayment.remaining)})`);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/money-debt-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_type: "Customer Payment TECH_H",
          party_id: partyId,
          party_type: "Money Changer",
          currency: "VND",
          amount,
          linked_payment_id: paymentId,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể đối soát thanh toán TECH_H");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Đối soát thanh toán TECH_H" onClose={onClose} testId="tech-h-reconcile-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có Payment TECH_H nào còn cần đối soát.</p>
      ) : (
        <div className="space-y-4">
          <Select
            data-testid="tech-h-payment-select"
            label="Payment TECH_H *"
            placeholder="Chọn payment"
            options={paymentOptions}
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
          />
          {selectedPayment && (
            <p className="text-xs text-muted-foreground -mt-2">
              Ngày thanh toán {formatDate(selectedPayment.payment_date)} · Tổng {vnd.format(selectedPayment.amount)} · Còn lại{" "}
              {vnd.format(selectedPayment.remaining)}
            </p>
          )}
          <Select
            data-testid="tech-h-party-select"
            label="Money Changer nhận tiền *"
            placeholder="Chọn Money Changer"
            options={partyOptions}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
          />
          <CurrencyInput testId="tech-h-amount-input" label="Số tiền đối soát (VND) *" value={amount} onChange={setAmount} />
          <Input data-testid="tech-h-note-input" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="tech-h-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button
          data-testid="tech-h-save-button"
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={candidates.length === 0}
        >
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
