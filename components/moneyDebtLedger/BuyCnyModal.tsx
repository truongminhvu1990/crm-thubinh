"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CurrencyInput from "@/components/ui/CurrencyInput";
import DecimalInput from "@/components/ui/DecimalInput";

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

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §14/D4 — BUY_CNY: one logical
 * transaction group, two physical rows (VND OUT + CNY IN against the same
 * Money Changer), created atomically by
 * create_buy_cny_ledger_transaction(). Money Changer only — Supplier is
 * never the party of a Buy CNY transaction (§9). */
export default function BuyCnyModal({ open, onClose, onSaved }: Props) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [partyId, setPartyId] = useState("");
  const [vndAmount, setVndAmount] = useState<number | undefined>(undefined);
  const [cnyAmount, setCnyAmount] = useState<number | undefined>(undefined);
  const [fxRate, setFxRate] = useState<number | undefined>(undefined);
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/money-debt-ledger/counterparties")
      .then((res) => res.json())
      .then((rows: Counterparty[]) => setCounterparties(rows.filter((p) => p.partner_type === "Money Changer")))
      .catch(() => setCounterparties([]));
  }, [open]);

  if (!open) return null;

  const partyOptions = counterparties.map((p) => ({ value: p.id, label: p.name }));
  // fx_rate = VND / CNY — pure display helper, computed only when both
  // amounts are present; never sent to the server in place of the
  // explicitly-entered fx_rate (§22 — fx_rate belongs to the logical FX
  // transaction, entered directly, not silently re-derived).
  const impliedRate = vndAmount && cnyAmount ? vndAmount / cnyAmount : null;

  async function handleSave() {
    setError(null);
    if (!partyId) {
      setError("Vui lòng chọn đơn vị đổi tiền (Money Changer)");
      return;
    }
    if (!vndAmount || vndAmount <= 0 || !cnyAmount || cnyAmount <= 0) {
      setError("Số tiền VND và CNY phải lớn hơn 0");
      return;
    }
    if (!fxRate || fxRate <= 0) {
      setError("Vui lòng nhập tỷ giá");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/money-debt-ledger/buy-cny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party_id: partyId,
          vnd_amount: vndAmount,
          cny_amount: cnyAmount,
          fx_rate: fxRate,
          transaction_date: transactionDate,
          reference: reference || null,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể ghi nhận giao dịch mua CNY");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Mua CNY (Buy CNY)" onClose={onClose} testId="buy-cny-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="space-y-4">
        <Select
          data-testid="buy-cny-party-select"
          label="Đơn vị đổi tiền *"
          placeholder="Chọn Money Changer"
          options={partyOptions}
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
        />
        <CurrencyInput testId="buy-cny-vnd-input" label="Số VND chi ra (OUT) *" value={vndAmount} onChange={setVndAmount} />
        <DecimalInput testId="buy-cny-cny-input" label="Số CNY nhận về (IN) *" value={cnyAmount} onChange={setCnyAmount} maxDecimals={2} />
        <div>
          <DecimalInput testId="buy-cny-fxrate-input" label="Tỷ giá (VND/CNY) *" value={fxRate} onChange={setFxRate} maxDecimals={4} />
          {impliedRate && <p className="text-xs text-muted-foreground mt-1">Tỷ giá suy ra từ số tiền: {impliedRate.toLocaleString("vi-VN")}</p>}
        </div>
        <Input
          data-testid="buy-cny-date-input"
          label="Ngày giao dịch"
          type="date"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
        />
        <Input data-testid="buy-cny-reference-input" label="Tham chiếu" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input data-testid="buy-cny-note-input" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="buy-cny-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button data-testid="buy-cny-save-button" variant="primary" onClick={handleSave} isLoading={isSaving}>
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
