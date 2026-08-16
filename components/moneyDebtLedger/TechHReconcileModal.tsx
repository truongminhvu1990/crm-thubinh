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

interface ReconciliationCandidate {
  id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  payment_date: string;
  already_reconciled: number;
  remaining: number;
  order?: { order_number: string; customer?: { full_name: string } | null } | null;
  receiving_account_id: string | null;
  bank: string | null;
  account_owner: string | null;
  account_currency: string | null;
  account_label: string | null;
  account_number: string | null;
  money_changer_partner_id: string | null;
  money_changer_name: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §12, extended by Stage 5 (Product
 * Owner Locked Decisions, 2026-08-16) — reconciles a qualifying Payment to
 * its downstream VND movement. Two candidate sources, merged (Phase 4):
 * historical TECH_H/TechH (payment_method-based, unchanged) and the new
 * generic Receiving-Account + Money-Changer-association path. Payment
 * stays the source of truth (D9) — this only creates a linked
 * 'Customer Payment TECH_H' ledger row via the existing governed
 * create_money_debt_ledger_entry() RPC (Phase 8 — the write path itself is
 * completely unchanged); nothing about the Payment or the Receiving
 * Account is ever written back here. When the selected candidate has a
 * money_changer_partner_id, the Money Changer picker is PRE-FILLED from it
 * (Phase 8) — but it remains an ordinary editable Select and the user must
 * still explicitly confirm (or change) it before saving; nothing is ever
 * auto-submitted (Phase 6/12/13 — no automatic reconciliation). */
export default function TechHReconcileModal({ open, onClose, onSaved }: Props) {
  const [candidates, setCandidates] = useState<ReconciliationCandidate[]>([]);
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
      fetch("/api/money-debt-ledger/reconciliation-candidates").then((res) => res.json()),
      fetch("/api/money-debt-ledger/counterparties").then((res) => res.json()),
    ])
      .then(([paymentRows, partyRows]: [ReconciliationCandidate[], Counterparty[]]) => {
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
    // Phase 8 pre-fill — amount always; party_id only when the candidate
    // has a configured money_changer_partner_id (a Tech_H/TechH historical
    // candidate never does, so its party picker starts empty, exactly as
    // before Stage 5).
    if (selectedPayment) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived-field sync, not an external-system subscription
      setAmount(selectedPayment.remaining);
      setPartyId(selectedPayment.money_changer_partner_id ?? "");
    }
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
      setError("Vui lòng chọn payment cần đối soát");
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
    <Modal open={open} title="Đối soát Money/Debt" onClose={onClose} testId="tech-h-reconcile-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có payment nào còn cần đối soát.</p>
      ) : (
        <div className="space-y-4">
          <Select
            data-testid="tech-h-payment-select"
            label="Payment *"
            placeholder="Chọn payment"
            options={paymentOptions}
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
          />
          {selectedPayment && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>Ngày thanh toán {formatDate(selectedPayment.payment_date)}</p>
              {selectedPayment.payment_method && <p>Phương thức: {selectedPayment.payment_method}</p>}
              <p>
                Tổng {vnd.format(selectedPayment.amount)} · Đã đối soát {vnd.format(selectedPayment.already_reconciled)} · Còn lại{" "}
                {vnd.format(selectedPayment.remaining)}
              </p>
              {/* Receiving Account context is read-only — never written back here (Phase 6). */}
              {selectedPayment.receiving_account_id ? (
                <p>
                  Tài khoản nhận: {selectedPayment.bank ?? "—"} · Chủ tài khoản {selectedPayment.account_owner ?? "—"} ·{" "}
                  {selectedPayment.account_currency ?? "—"} · {selectedPayment.account_number ?? "—"}
                  {selectedPayment.account_label ? ` (${selectedPayment.account_label})` : ""}
                </p>
              ) : (
                <p>Tài khoản nhận: — (payment lịch sử, không có Receiving Account)</p>
              )}
              <p>Money Changer liên kết: {selectedPayment.money_changer_name ?? "— (chưa cấu hình, chọn thủ công bên dưới)"}</p>
            </div>
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
