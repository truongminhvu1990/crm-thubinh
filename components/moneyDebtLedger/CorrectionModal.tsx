"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DecimalInput from "@/components/ui/DecimalInput";
import { MoneyDebtLedgerEntry } from "@/types/moneyDebtLedger";
import { moneyDebtLedgerTypeLabel } from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatAmount(amount: number, currency: string): string {
  return currency === "VND" ? vnd.format(amount) : `¥${cny.format(amount)}`;
}

interface Props {
  entry: MoneyDebtLedgerEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Stage 19B (Product Owner "COMPLETE MONEY/DEBT BUSINESS FLOW",
 * 2026-08-17) — the "Edit voucher" affordance, anchored to one specific
 * row. Never edits/deletes that row (D7, the immutability trigger still
 * blocks it unconditionally) — always creates a new Adjustment carrying a
 * *delta*, not a restated total, via create_money_debt_ledger_correction().
 * Direction is explicit (increase/decrease), not inferred, so the person
 * entering the correction always sees exactly what they're recording.
 * Server-side rejects a decrease that would take a Money Changer's balance
 * negative (§ the migration's own doc comment) — surfaced here as a plain
 * error message, never a silent no-op. */
export default function CorrectionModal({ entry, onClose, onSaved }: Props) {
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!entry) return null;

  const directionOptions = [
    { value: "IN", label: `Tăng thêm (${entry.currency})` },
    { value: "OUT", label: `Giảm bớt (${entry.currency})` },
  ];

  const originalSigned = entry.direction === "IN" ? entry.amount : -entry.amount;
  const correctionSigned = amount ? (direction === "IN" ? amount : -amount) : null;
  const netSigned = correctionSigned !== null ? originalSigned + correctionSigned : null;

  async function handleSave() {
    setError(null);
    if (!amount || amount <= 0) {
      setError("Số tiền điều chỉnh phải lớn hơn 0");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/money-debt-ledger/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corrects_entry_id: entry!.id,
          amount,
          direction,
          reference: reference || null,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể ghi nhận điều chỉnh");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={!!entry} title={`Sửa giao dịch ${entry.entry_code}`} onClose={onClose} testId="correction-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900">
        <p className="font-semibold">Giao dịch gốc không thay đổi.</p>
        <p className="mt-0.5">Hệ thống sẽ tạo một giao dịch điều chỉnh mới để sửa sai số — không sửa/xóa chứng từ cũ.</p>
      </div>

      <div className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        {moneyDebtLedgerTypeLabel(entry.transaction_type)} · {entry.party?.name ?? "—"}
      </div>

      <div className="space-y-4">
        <Select
          data-testid="correction-direction-select"
          label="Loại điều chỉnh *"
          options={directionOptions}
          value={direction}
          onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}
        />
        <DecimalInput
          testId="correction-amount-input"
          label={`Số tiền chênh lệch (${entry.currency}) *`}
          value={amount}
          onChange={setAmount}
          maxDecimals={entry.currency === "VND" ? 0 : 2}
        />
        <Input data-testid="correction-reference-input" label="Tham chiếu" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input data-testid="correction-note-input" label="Lý do điều chỉnh" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="rounded-lg border border-border bg-card p-3 mt-4 space-y-1 text-sm" data-testid="correction-preview">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Gốc</span>
          <span className="tabular-nums font-medium">
            {originalSigned >= 0 ? "+" : ""}
            {formatAmount(originalSigned, entry.currency)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Điều chỉnh</span>
          <span className="tabular-nums font-medium">
            {correctionSigned === null ? "—" : `${correctionSigned >= 0 ? "+" : ""}${formatAmount(correctionSigned, entry.currency)}`}
          </span>
        </div>
        <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
          <span>Net (số dư sau điều chỉnh)</span>
          <span className="tabular-nums">
            {netSigned === null ? "—" : `${netSigned >= 0 ? "+" : ""}${formatAmount(netSigned, entry.currency)}`}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="correction-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button data-testid="correction-save-button" variant="primary" onClick={handleSave} isLoading={isSaving}>
          Lưu điều chỉnh
        </Button>
      </div>
    </Modal>
  );
}
