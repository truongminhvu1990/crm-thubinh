"use client";

import { useState } from "react";
import { OrderPayment } from "@/types/order";
import { calculateRemainingBalance } from "@/lib/orders/order.rules";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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
 * (ORDERS_SPEC.md §4). payment_method is a plain text input since the
 * `payment_method` master-data category doesn't exist yet (a known,
 * separately-tracked gap — ORDERS_IMPLEMENTATION_PLAN.md Task 2). */
export default function AddPaymentModal({ open, orderId, totalAmount, payments, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  const alreadyPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = calculateRemainingBalance(totalAmount, payments);
  const amountNumber = Number(amount) || 0;
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
    <Modal open={open} title="Thêm thanh toán" onClose={onClose}>
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
          <Input
            label="Số tiền *"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {overpaymentWarning && <p className="text-xs text-amber-600 mt-1">{overpaymentWarning}</p>}
        </div>
        <Input
          label="Phương thức *"
          placeholder="Tiền mặt, chuyển khoản..."
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        />
        <Input label="Ngày thanh toán" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        <Input label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

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
