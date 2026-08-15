import { calculateAmountPaid, calculateRemainingBalance } from "@/lib/orders/order.rules";

/** Shared by Monthly Sold Products and Payment Method Report drill-down —
 * both need "Đã thanh toán" / "Tiền còn lại" / "Phương thức thanh toán" for
 * an Order, and both must derive them the same way rather than each
 * re-deriving its own formula. Reuses calculateAmountPaid/
 * calculateRemainingBalance (lib/orders/order.rules.ts, already the
 * order.service.ts-proven source of truth for these figures) verbatim —
 * this module adds no new payment/revenue math, only formatting.
 *
 * Payment Method: `payments` is genuinely multi-row per Order, each with its
 * own method (no per-line-item allocation exists in the schema). The Order
 * Detail page's own payments list (OrderPaymentsList.tsx, ORDERS_UI.md §8)
 * already establishes the precedent for this: every payment is shown, never
 * collapsed to a single assumed method. A report row is one line per
 * Order/Product, so it needs a single display value — this lists every
 * distinct method actually recorded on the Order, comma-joined, rather than
 * picking one. `null` (not "") when the Order has no payments yet, so it
 * renders as "—" the same way this codebase's other not-yet-known payment
 * fields already do. */
export interface OrderPaymentSummary {
  amountPaid: number;
  remainingBalance: number;
  paymentMethods: string | null;
}

export function deriveOrderPaymentSummary(
  totalAmount: number,
  payments: { amount: number; payment_method: string }[]
): OrderPaymentSummary {
  const amountPaid = calculateAmountPaid(payments);
  const remainingBalance = calculateRemainingBalance(totalAmount, payments);
  const distinctMethods = [...new Set(payments.map((p) => p.payment_method))].sort((a, b) => a.localeCompare(b, "vi"));

  return {
    amountPaid,
    remainingBalance,
    paymentMethods: distinctMethods.length > 0 ? distinctMethods.join(", ") : null,
  };
}
