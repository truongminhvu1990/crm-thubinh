"use client";

import { Wallet } from "lucide-react";
import { OrderPayment } from "@/types/order";
import { calculateRemainingBalance } from "@/lib/orders/order.rules";
import { formatDate } from "@/lib/utils";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  payments: OrderPayment[];
  totalAmount: number;
}

/** ORDERS_UI.md §8 — read-only payments list + prominent remaining balance.
 * No edit/delete action, per the locked "Payment: ADD ONLY" rule. */
export default function OrderPaymentsList({ payments, totalAmount }: Props) {
  const remaining = calculateRemainingBalance(totalAmount, payments);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-foreground">
          {remaining <= 0 ? "Đã thanh toán đủ" : `Còn lại: ${currency.format(remaining)}`}
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="text-center py-6">
          <Wallet className="w-5 h-5 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">Chưa có thanh toán nào</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left font-semibold px-1 py-2">Ngày</th>
              <th className="text-right font-semibold px-1 py-2">Số tiền</th>
              <th className="text-left font-semibold px-1 py-2">Phương thức</th>
              <th className="text-left font-semibold px-1 py-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b border-border last:border-0">
                <td className="px-1 py-2 whitespace-nowrap">{formatDate(payment.payment_date)}</td>
                <td className="px-1 py-2 text-right font-medium">{currency.format(payment.amount)}</td>
                <td className="px-1 py-2">{payment.payment_method}</td>
                <td className="px-1 py-2 text-muted-foreground">{payment.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
