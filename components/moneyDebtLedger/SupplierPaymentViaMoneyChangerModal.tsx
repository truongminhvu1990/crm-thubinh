"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DecimalInput from "@/components/ui/DecimalInput";
import { MoneyDebtLedgerBalance } from "@/types/moneyDebtLedger";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

interface Counterparty {
  id: string;
  name: string;
  partner_type: string;
}

interface BalanceRow extends MoneyDebtLedgerBalance {
  party: { id: string; name: string; partner_type: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Stage 20 Phase J — already-fetched balances from the page (no extra
   * request), used only to show a live "current balance -> balance after"
   * preview before Save. The actual insufficient-balance guard is still
   * enforced server-side (create_supplier_payment_via_money_changer) —
   * this is a UX preview, not a replacement for that check. */
  balances: BalanceRow[];
}

/** Stage 19B (Product Owner "COMPLETE MONEY/DEBT BUSINESS FLOW",
 * 2026-08-17) — Supplier Payment via Money Changer: one logical
 * transaction, two physical rows (VND OUT against the Money Changer, CNY
 * OUT against the Supplier), created atomically by
 * create_supplier_payment_via_money_changer(). The VND amount is never
 * entered directly — it is always cny_amount x fx_rate, computed and
 * validated server-side so the two legs can never drift; this modal only
 * *displays* the computed value before submit. */
export default function SupplierPaymentViaMoneyChangerModal({ open, onClose, onSaved, balances }: Props) {
  const [moneyChangers, setMoneyChangers] = useState<Counterparty[]>([]);
  const [suppliers, setSuppliers] = useState<Counterparty[]>([]);
  const [moneyChangerId, setMoneyChangerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
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
      .then((rows: Counterparty[]) => {
        setMoneyChangers(rows.filter((p) => p.partner_type === "Money Changer"));
        setSuppliers(rows.filter((p) => p.partner_type === "Supplier"));
      })
      .catch(() => {
        setMoneyChangers([]);
        setSuppliers([]);
      });
  }, [open]);

  if (!open) return null;

  const moneyChangerOptions = moneyChangers.map((p) => ({ value: p.id, label: p.name }));
  const supplierOptions = suppliers.map((p) => ({ value: p.id, label: p.name }));
  const computedVndAmount = cnyAmount && fxRate ? cnyAmount * fxRate : null;
  const selectedMoneyChanger = moneyChangers.find((p) => p.id === moneyChangerId);
  const currentVndBalance = moneyChangerId
    ? (balances.find((b) => b.party_id === moneyChangerId && b.currency === "VND")?.balance ?? 0)
    : null;
  const balanceAfter = currentVndBalance !== null && computedVndAmount !== null ? currentVndBalance - computedVndAmount : null;
  const insufficientPreview = balanceAfter !== null && balanceAfter < 0;

  async function handleSave() {
    setError(null);
    if (!moneyChangerId) {
      setError("Vui lòng chọn đơn vị đổi tiền (Money Changer)");
      return;
    }
    if (!supplierId) {
      setError("Vui lòng chọn nhà cung cấp");
      return;
    }
    if (!cnyAmount || cnyAmount <= 0) {
      setError("Số tiền CNY phải lớn hơn 0");
      return;
    }
    if (!fxRate || fxRate <= 0) {
      setError("Vui lòng nhập tỷ giá");
      return;
    }
    if (insufficientPreview && currentVndBalance !== null && computedVndAmount !== null) {
      setError(
        `Số dư không đủ: ${selectedMoneyChanger?.name ?? "Money Changer"} hiện có ${vnd.format(currentVndBalance)}, cần thanh toán ${vnd.format(computedVndAmount)}.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/money-debt-ledger/supplier-payment-via-money-changer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          money_changer_partner_id: moneyChangerId,
          supplier_partner_id: supplierId,
          cny_amount: cnyAmount,
          fx_rate: fxRate,
          transaction_date: transactionDate,
          reference: reference || null,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể ghi nhận giao dịch thanh toán nhà cung cấp");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Thanh toán nhà cung cấp qua Money Changer" onClose={onClose} testId="supplier-payment-via-money-changer-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="space-y-4">
        <Select
          data-testid="supplier-payment-via-money-changer-mc-select"
          label="Đơn vị đổi tiền (trừ VND) *"
          placeholder="Chọn Money Changer"
          options={moneyChangerOptions}
          value={moneyChangerId}
          onChange={(e) => setMoneyChangerId(e.target.value)}
        />
        <Select
          data-testid="supplier-payment-via-money-changer-supplier-select"
          label="Nhà cung cấp (nhận CNY) *"
          placeholder="Chọn nhà cung cấp"
          options={supplierOptions}
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        />
        <DecimalInput
          testId="supplier-payment-via-money-changer-cny-input"
          label="Số CNY thanh toán (OUT) *"
          value={cnyAmount}
          onChange={setCnyAmount}
          maxDecimals={2}
        />
        <div>
          <DecimalInput
            testId="supplier-payment-via-money-changer-fxrate-input"
            label="Tỷ giá *"
            value={fxRate}
            onChange={setFxRate}
            maxDecimals={4}
          />
          {fxRate ? <p className="text-xs text-muted-foreground mt-1">1 CNY = {fxRate.toLocaleString("vi-VN")} VND</p> : null}
        </div>
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5" data-testid="supplier-payment-via-money-changer-vnd-equivalent">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">VND equivalent (hệ thống tự tính — không thể chỉnh sửa)</p>
          <p className="text-lg font-semibold text-foreground mt-0.5">{computedVndAmount ? computedVndAmount.toLocaleString("vi-VN") + " ₫" : "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">= CNY × tỷ giá. Số tiền này sẽ được trừ khỏi số dư VND của Money Changer đã chọn.</p>
        </div>
        <Input
          data-testid="supplier-payment-via-money-changer-date-input"
          label="Ngày giao dịch"
          type="date"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
        />
        <Input
          data-testid="supplier-payment-via-money-changer-reference-input"
          label="Tham chiếu"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <Input data-testid="supplier-payment-via-money-changer-note-input" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {selectedMoneyChanger && computedVndAmount !== null && currentVndBalance !== null && (
        <div
          className={`rounded-lg border p-3 mt-4 space-y-1 text-sm ${insufficientPreview ? "border-destructive/40 bg-red-50" : "border-border bg-muted/40"}`}
          data-testid="supplier-payment-via-money-changer-summary"
        >
          <p className="font-medium text-foreground">{selectedMoneyChanger.name}</p>
          <div className="flex justify-between text-muted-foreground">
            <span>Số dư hiện tại</span>
            <span className="tabular-nums">{vnd.format(currentVndBalance)}</span>
          </div>
          <div className="flex justify-between text-destructive">
            <span>Khoản thanh toán</span>
            <span className="tabular-nums">-{vnd.format(computedVndAmount)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-border/60 pt-1">
            <span>Số dư sau giao dịch</span>
            <span className={`tabular-nums ${insufficientPreview ? "text-destructive" : "text-foreground"}`}>{vnd.format(balanceAfter ?? 0)}</span>
          </div>
          {insufficientPreview && <p className="text-destructive text-xs pt-1">Số dư không đủ — không thể tạo giao dịch này.</p>}
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="supplier-payment-via-money-changer-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button
          data-testid="supplier-payment-via-money-changer-save-button"
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={insufficientPreview}
        >
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
