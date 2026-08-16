"use client";

import { useEffect, useState } from "react";
import { OrderPayment } from "@/types/order";
import { calculateRemainingBalance } from "@/lib/orders/order.rules";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { BANK_TRANSFER_PAYMENT_METHOD } from "@/lib/orders/order.constants";
import { getReceivingAccountOptions, ReceivingAccountOption } from "@/lib/receivingAccount.service";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CurrencyInput from "@/components/ui/CurrencyInput";
import Select from "@/components/ui/Select";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  open: boolean;
  orderId: string;
  totalAmount: number;
  payments: OrderPayment[];
  onClose: () => void;
  onSaved: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** ORDERS_UI.md §7 — Add Payment modal. Overpayment warns but never blocks
 * (ORDERS_SPEC.md §4). payment_method is a Select backed by the
 * `payment_method` master-data category (UX Enhancement Package, Part 2). */
export default function AddPaymentModal({ open, orderId, totalAmount, payments, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [note, setNote] = useState("");
  const [receivingAccountId, setReceivingAccountId] = useState("");
  const [receivingAccountOptions, setReceivingAccountOptions] = useState<ReceivingAccountOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const paymentMethodOptions = useMasterDataOptions("payment_method", paymentMethod);
  const requiresReceivingAccount = paymentMethod === BANK_TRANSFER_PAYMENT_METHOD;

  useEffect(() => {
    if (!open || !requiresReceivingAccount) return;
    getReceivingAccountOptions()
      .then(setReceivingAccountOptions)
      .catch(() => setReceivingAccountOptions([]));
  }, [open, requiresReceivingAccount]);

  useEffect(() => {
    // Payment / Bank Account / Money-Debt domain redesign, Stage 3 (LOCKED)
    // — receiving_account_id must become NULL the moment payment_method
    // stops being the bank-transfer value, never left stale.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived-field reset on payment_method change, not an external-system subscription
    if (!requiresReceivingAccount) setReceivingAccountId("");
  }, [requiresReceivingAccount]);

  if (!open) return null;

  const alreadyPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = calculateRemainingBalance(totalAmount, payments);
  const amountNumber = amount || 0;
  const overpaymentWarning = amountNumber > remaining ? "Số tiền vượt quá số dư còn lại" : null;

  async function handleSave() {
    setError(null);

    if (amountNumber <= 0) {
      setError("Số tiền thanh toán phải lớn hơn 0");
      return;
    }
    if (!paymentMethod) {
      setError("Vui lòng nhập phương thức thanh toán");
      return;
    }
    if (requiresReceivingAccount && !receivingAccountId) {
      setError("Vui lòng chọn tài khoản nhận tiền");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNumber,
          payment_method: paymentMethod,
          payment_date: paymentDate,
          note: note || null,
          receiving_account_id: requiresReceivingAccount ? receivingAccountId : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể thêm thanh toán");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Thêm thanh toán" onClose={onClose} testId="payment-modal">
      <div className="space-y-1 text-sm mb-4 pb-4 border-b border-border">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tổng tiền</span>
          <span>{currency.format(totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Đã thanh toán</span>
          <span>{currency.format(alreadyPaid)}</span>
        </div>
        <div className="flex justify-between font-medium text-foreground">
          <span>Còn lại</span>
          <span>{currency.format(remaining)}</span>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="space-y-4">
        <div>
          <CurrencyInput
            testId="payment-amount-input"
            label="Số tiền *"
            value={amount}
            onChange={setAmount}
          />
          {overpaymentWarning && <p className="text-xs text-amber-600 mt-1">{overpaymentWarning}</p>}
        </div>
        <Select
          data-testid="payment-method-select"
          label="Phương thức *"
          placeholder="Chọn phương thức"
          options={paymentMethodOptions}
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        />
        {requiresReceivingAccount && (
          <Select
            data-testid="payment-receiving-account-select"
            label="Tài khoản nhận tiền *"
            placeholder="Chọn tài khoản nhận tiền"
            options={receivingAccountOptions.map((o) => ({ value: o.id, label: o.label }))}
            value={receivingAccountId}
            onChange={(e) => setReceivingAccountId(e.target.value)}
          />
        )}
        <Input
          data-testid="payment-date-input"
          label="Ngày thanh toán"
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
        <Input data-testid="payment-note-input" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="payment-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button data-testid="payment-save-button" variant="primary" onClick={handleSave} isLoading={isSaving}>
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
