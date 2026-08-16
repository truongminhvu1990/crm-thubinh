"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DecimalInput from "@/components/ui/DecimalInput";
import {
  MONEY_DEBT_LEDGER_CREATABLE_TYPE_OPTIONS,
  MONEY_DEBT_LEDGER_CALLER_CHOOSES_DIRECTION,
} from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";
import { MoneyDebtLedgerTransactionType, MoneyDebtLedgerCurrency } from "@/types/moneyDebtLedger";

interface Counterparty {
  id: string;
  name: string;
  partner_type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** §9's single-row transaction types (everything except 'Buy CNY', which
 * has its own BuyCnyModal, and 'Customer Payment TECH_H', which has its
 * own TechHReconcileModal since it must be linked to a specific Payment).
 * This modal covers: VND Held By Money Changer, CNY Held By Supplier,
 * Deposit, Deposit Consumed, Supplier Payment, Adjustment. */
export default function RecordMovementModal({ open, onClose, onSaved }: Props) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [transactionType, setTransactionType] = useState<Exclude<MoneyDebtLedgerTransactionType, "Buy CNY" | "Customer Payment TECH_H">>(
    "VND Held By Money Changer"
  );
  const [partyId, setPartyId] = useState("");
  const [currency, setCurrency] = useState<MoneyDebtLedgerCurrency>("VND");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/money-debt-ledger/counterparties")
      .then((res) => res.json())
      .then(setCounterparties)
      .catch(() => setCounterparties([]));
  }, [open]);

  // Currency is implied by transaction_type for every type except
  // Adjustment (§9) — keep the field in sync instead of trusting stale
  // state from a previous type selection.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived-field sync, not an external-system subscription
    if (transactionType === "VND Held By Money Changer") setCurrency("VND");
    else if (transactionType === "Adjustment") return;
    else setCurrency("CNY");
  }, [transactionType]);

  const showsDirectionPicker = MONEY_DEBT_LEDGER_CALLER_CHOOSES_DIRECTION.includes(transactionType);
  const selectedParty = counterparties.find((p) => p.id === partyId);
  const partyOptions = counterparties.map((p) => ({ value: p.id, label: `${p.name} (${p.partner_type})` }));

  if (!open) return null;

  async function handleSave() {
    setError(null);
    if (!amount || amount <= 0) {
      setError("Số tiền phải lớn hơn 0");
      return;
    }
    if (!partyId || !selectedParty) {
      setError("Vui lòng chọn đối tác (Money Changer/Supplier)");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/money-debt-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_type: transactionType,
          party_id: partyId,
          party_type: selectedParty.partner_type,
          currency,
          amount,
          direction: showsDirectionPicker ? direction : undefined,
          transaction_date: transactionDate,
          reference: reference || null,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể ghi nhận giao dịch");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Ghi nhận giao dịch" onClose={onClose} testId="record-movement-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="space-y-4">
        <Select
          data-testid="movement-type-select"
          label="Loại giao dịch *"
          options={MONEY_DEBT_LEDGER_CREATABLE_TYPE_OPTIONS}
          value={transactionType}
          onChange={(e) => setTransactionType(e.target.value as typeof transactionType)}
        />

        <Select
          data-testid="movement-party-select"
          label="Đối tác *"
          placeholder="Chọn Money Changer/Supplier"
          options={partyOptions}
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
        />

        {transactionType === "Adjustment" && (
          <Select
            data-testid="movement-currency-select"
            label="Đơn vị tiền tệ *"
            options={[
              { value: "VND", label: "VND" },
              { value: "CNY", label: "CNY" },
            ]}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as MoneyDebtLedgerCurrency)}
          />
        )}

        {showsDirectionPicker && (
          <Select
            data-testid="movement-direction-select"
            label="Chiều *"
            options={[
              { value: "IN", label: "IN — Tiền vào" },
              { value: "OUT", label: "OUT — Tiền ra" },
            ]}
            value={direction}
            onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}
          />
        )}

        {currency === "VND" ? (
          <CurrencyInput testId="movement-amount-input" label="Số tiền (VND) *" value={amount} onChange={setAmount} />
        ) : (
          <DecimalInput testId="movement-amount-input" label="Số tiền (CNY) *" value={amount} onChange={setAmount} maxDecimals={2} />
        )}

        <Input
          data-testid="movement-date-input"
          label="Ngày giao dịch"
          type="date"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
        />
        <Input data-testid="movement-reference-input" label="Tham chiếu" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input data-testid="movement-note-input" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="movement-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button data-testid="movement-save-button" variant="primary" onClick={handleSave} isLoading={isSaving}>
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
