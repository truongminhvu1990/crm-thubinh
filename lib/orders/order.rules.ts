import { OrderItem, OrderPayment, OrderStatus, PaymentStatus } from "@/types/order";

// Shared business layer — pure rules and derived calculations only. No I/O,
// no Supabase, no UI. Every rule traces to ORDERS_SPEC.md as cited inline.

// ---------------------------------------------------------------------------
// Rollup calculations (ORDERS_SPEC.md §3, ORDERS_DATABASE.md §4).
//
// ORDERS_DATABASE.md §4 fixes the formula: Total amount = Subtotal − Discount
// total. That only holds if Subtotal is the *pre-discount* sum (price ×
// quantity) — if Subtotal were instead the sum of each line's already
// net-of-discount Line Total, subtracting Discount total again would double
// count it. So "sum of line totals" in ORDERS_SPEC.md §3 is read here as the
// gross, pre-discount sum, to stay consistent with the DB §4 formula.
// ---------------------------------------------------------------------------

type ItemForRollup = Pick<OrderItem, "snapshot_sale_price" | "quantity" | "discount">;

export function calculateSubtotal(items: ItemForRollup[]): number {
  return items.reduce((sum, item) => sum + item.snapshot_sale_price * item.quantity, 0);
}

export function calculateDiscountTotal(items: ItemForRollup[]): number {
  return items.reduce((sum, item) => sum + item.discount, 0);
}

/** ORDERS_DATABASE.md §4: "Total amount | Derived (Subtotal − Discount total)". */
export function calculateTotalAmount(subtotal: number, discountTotal: number): number {
  return subtotal - discountTotal;
}

// ---------------------------------------------------------------------------
// Payment remaining (ORDERS_UI.md §8: "running 'remaining balance' shown
// prominently ... Total amount − sum(Payments)").
// ---------------------------------------------------------------------------

export function calculateAmountPaid(payments: Pick<OrderPayment, "amount">[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function calculateRemainingBalance(totalAmount: number, payments: Pick<OrderPayment, "amount">[]): number {
  return totalAmount - calculateAmountPaid(payments);
}

/** ORDERS_SPEC.md §3: "Line total — Snapshot Sale Price × quantity, minus discount." */
export function computeLineTotal(snapshotSalePrice: number, discount: number, quantity: number): number {
  return snapshotSalePrice * quantity - discount;
}

/** ORDERS_SPEC.md §4: Unpaid (no payments) / Partially Paid (sum < total) / Paid (sum >= total). */
export function derivePaymentStatus(totalAmount: number, paymentsSum: number): PaymentStatus {
  if (paymentsSum <= 0) return "Unpaid";
  return paymentsSum >= totalAmount ? "Paid" : "Partially Paid";
}

// ---------------------------------------------------------------------------
// Order status transitions (ORDERS_SPEC.md §4, §14).
//
// Draft and Reserved are both "open" and freely interchange (Create Order,
// ORDERS_UI.md §4, can save either way and revisit). Completed and Lost are
// each reached only from an open order and are terminal in V1 — no un-complete
// (§7: Sold is terminal) and no un-lose (§4: a Completed order cannot become
// Lost, and there is no reverse action either).
// ---------------------------------------------------------------------------

const ALLOWED_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Draft: ["Reserved", "Completed", "Lost"],
  Reserved: ["Draft", "Completed", "Lost"],
  Completed: [],
  Lost: [],
};

export function isValidOrderStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function isOrderOpen(status: OrderStatus): boolean {
  return status === "Draft" || status === "Reserved";
}

/** ORDERS_SPEC.md §4: "editable while open, locked once Completed." */
export function canEditOrderItems(status: OrderStatus): boolean {
  return isOrderOpen(status);
}

/** ORDERS_SPEC.md §6: Sales Owner "can be reassigned while the order is open." */
export function canReassignSalesOwner(status: OrderStatus): boolean {
  return isOrderOpen(status);
}

/** ORDERS_UI.md §6 action table: Complete is available from Draft or Reserved.
 * Delegates to the transition table above rather than re-checking isOrderOpen,
 * so the two stay a single source of truth. */
export function canCompleteOrder(status: OrderStatus): boolean {
  return isValidOrderStatusTransition(status, "Completed");
}

/** ORDERS_SPEC.md §4: "can be marked Lost only while it is Draft or Reserved." */
export function canMarkOrderLost(status: OrderStatus): boolean {
  return isValidOrderStatusTransition(status, "Lost");
}

/**
 * ORDERS_SPEC.md §5's follow-on rule: Add Payment stays valid on a Completed
 * order whose Payment Status isn't yet Paid. ORDERS_UI.md §7 Availability:
 * never on a Lost order (nothing left to collect on a dead deal), never once
 * Paid (nothing left to pay).
 */
export function canAddPayment(orderStatus: OrderStatus, paymentStatus: PaymentStatus): boolean {
  if (orderStatus === "Lost") return false;
  if (orderStatus === "Completed") return paymentStatus !== "Paid";
  return true;
}

/**
 * Order completion validation. Only the constraints ORDERS_SPEC.md/ORDERS_UI.md
 * actually state are enforced: status must be open, and an order needs at
 * least one item. No payment-based threshold is enforced here — ORDERS_SPEC.md
 * §5 explicitly treats completing on partial (or zero) payment as normal
 * business ("deposit sales, pay-on-delivery... all normal"), and no document
 * specifies a minimum-payment gate, so inventing one here would be a business
 * decision this layer isn't authorized to make.
 */
export function validateOrderCompletion(status: OrderStatus, itemCount: number): string | null {
  if (!canCompleteOrder(status)) {
    return "Đơn hàng không ở trạng thái có thể hoàn thành";
  }
  return validateOrderHasItems(itemCount);
}

/** ORDERS_SPEC.md §4: Lost is only reachable from an open (Draft/Reserved) order. */
export function validateMarkOrderLostTransition(status: OrderStatus): string | null {
  return canMarkOrderLost(status) ? null : "Chỉ có thể đánh dấu Lost khi đơn đang ở trạng thái Nháp hoặc Đã giữ hàng";
}

/** ORDERS_DATABASE.md §7: order deletion is "a data-integrity backstop, not
 * a supported workflow" - restricted to Draft, the one status where nothing
 * (reservation, payment, completion) has happened yet. Same restriction
 * already applied at the repository layer's WHERE clause (order.repository.ts
 * deleteOrder) - this is the Service-layer check for the same rule, not a
 * new one. */
export function canDeleteOrder(status: OrderStatus): boolean {
  return status === "Draft";
}

export function validateOrderDeletion(status: OrderStatus): string | null {
  return canDeleteOrder(status) ? null : "Chỉ có thể xóa đơn hàng ở trạng thái Nháp";
}

// ---------------------------------------------------------------------------
// Order Timeline (ORDERS_SPEC.md §8, simplified progress bar) — pure
// derivation from current order_status/payment_status only, no I/O.
//
// Product Owner-approved V1 scope: uses current order state only, never
// reconstructs history from order_events, never infers a previous state. A
// Lost order is simply displayed as Lost — which stage it reached before
// being marked Lost (Draft or Reserved) is not required to be known.
// ---------------------------------------------------------------------------

export type OrderTimelineStage = "Created" | "Reserved" | "Payment" | "Completed";

/** ORDERS_SPEC.md §8: Created is always lit; Reserved lights once
 * order_status reaches Reserved or later; Payment lights once at least one
 * Payment has been logged (Payment Status != Unpaid); Completed lights once
 * order_status = Completed. */
export function deriveOrderTimelineStages(orderStatus: OrderStatus, paymentStatus: PaymentStatus): OrderTimelineStage[] {
  const stages: OrderTimelineStage[] = ["Created"];

  if (orderStatus === "Reserved" || orderStatus === "Completed") {
    stages.push("Reserved");
  }
  if (paymentStatus !== "Unpaid") {
    stages.push("Payment");
  }
  if (orderStatus === "Completed") {
    stages.push("Completed");
  }

  return stages;
}

/** ORDERS_SPEC.md §8: if the order is Lost, the bar shows as interrupted
 * rather than progressing to Completed. */
export function isOrderTimelineInterrupted(orderStatus: OrderStatus): boolean {
  return orderStatus === "Lost";
}

/** ORDERS_SPEC.md §1: an order groups one or more products — checks a
 * derived item count, not a DTO's shape, so it lives here rather than in
 * order.validation.ts. */
export function validateOrderHasItems(itemCount: number): string | null {
  return itemCount > 0 ? null : "Vui lòng thêm ít nhất một sản phẩm";
}
