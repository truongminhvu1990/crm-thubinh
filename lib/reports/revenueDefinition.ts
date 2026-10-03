/** Revenue & Sales Reporting Unification (Product Owner Decision) - the ONE
 * place that defines which Orders count as what in revenue reporting. Every
 * revenue/sold-products surface (Dashboard, Monthly Sold Products, ...) must
 * derive its Total / Recognized / Unrecognized split from these functions
 * instead of re-implementing the status checks, so the figures cannot
 * drift apart.
 *
 * Definitions (all applied at query time, nothing stored):
 *
 *  - SALES VALUE / TOTAL ("Tổng doanh thu"): every Order whose status is not
 *    Lost, valued at `orders.total_amount`, within the report's `order_date`
 *    range.
 *  - RECOGNIZED ("Doanh thu đã ghi nhận"): the subset that meets BR-001
 *    (LOCKED, docs/03_ORDER_SPEC.md §14) - Order Status = Completed AND
 *    Payment Status = Paid. This module does NOT change BR-001.
 *  - UNRECOGNIZED ("Doanh thu chưa ghi nhận"): TOTAL - RECOGNIZED, i.e.
 *    every non-Lost Order that is not Completed+Paid. It is computed as the
 *    complement inside the same population, so
 *    `total === recognized + unrecognized` holds by construction.
 *
 *  - SOLD ORDER (Sold Products scope, Product Owner answer): a narrower
 *    population than TOTAL - Order Status = Completed (any Payment Status),
 *    OR Order Status = Reserved with at least one ACTUAL payment record
 *    (a row in `payments` for that Order - a deposit). Draft orders,
 *    Reserved orders with no payment record, and Lost orders are not sold.
 *    Sold orders split into recognized / unrecognized by the SAME BR-001
 *    check above; Payment Status never removes a sold order from the sold
 *    set, it only decides recognition.
 *
 *    "At least one payment" is deliberately decided from payment RECORDS,
 *    never inferred from `orders.payment_status`: that column is derived
 *    (derivePaymentStatus) and reads "Paid" for a zero-total order with no
 *    payment at all (paymentsSum 0 >= total 0). `payments.amount` is
 *    CHECK (amount > 0) and `payments.order_id` is a NOT NULL FK to the
 *    Order, so a matching row is by construction a real payment against
 *    exactly that Order.
 */

export interface OrderStatusFields {
  order_status: string;
  payment_status: string;
}

export function isLostOrder(order: OrderStatusFields): boolean {
  return order.order_status === "Lost";
}

/** BR-001 (LOCKED): Completed AND Paid. */
export function isOrderRecognized(order: OrderStatusFields): boolean {
  return order.order_status === "Completed" && order.payment_status === "Paid";
}

/** Sold Products scope: Completed (any payment), or Reserved with at least
 * one payment record. `paymentCount` = number of `payments` rows recorded
 * against THIS order - never derived from payment_status. */
export function isSoldOrder(order: Pick<OrderStatusFields, "order_status">, paymentCount: number): boolean {
  if (order.order_status === "Completed") return true;
  return order.order_status === "Reserved" && paymentCount > 0;
}

export interface RevenueAmountRow extends OrderStatusFields {
  /** One entry per Order (not per line) - `orders.total_amount`. */
  amount: number;
}

export interface RevenueBreakdown {
  total: number;
  recognized: number;
  unrecognized: number;
  orderCount: number;
  recognizedOrderCount: number;
  unrecognizedOrderCount: number;
  /** recognized / total in [0, 1]; 0 when total is 0. */
  recognizedRatio: number;
}

export const EMPTY_REVENUE_BREAKDOWN: RevenueBreakdown = {
  total: 0,
  recognized: 0,
  unrecognized: 0,
  orderCount: 0,
  recognizedOrderCount: 0,
  unrecognizedOrderCount: 0,
  recognizedRatio: 0,
};

/** Splits already-scoped Orders into Total / Recognized / Unrecognized.
 * `include` decides which Orders are part of the population (default: every
 * non-Lost Order = SALES VALUE; pass a predicate built on `isSoldOrder` for
 * the Sold Products population). Unrecognized is derived as total - recognized so the identity
 * total = recognized + unrecognized can never break. */
export function summarizeRevenue(
  rows: RevenueAmountRow[],
  include: (order: OrderStatusFields) => boolean = (o) => !isLostOrder(o)
): RevenueBreakdown {
  let total = 0;
  let recognized = 0;
  let orderCount = 0;
  let recognizedOrderCount = 0;

  for (const row of rows) {
    if (!include(row)) continue;
    const amount = Number(row.amount) || 0;
    total += amount;
    orderCount += 1;
    if (isOrderRecognized(row)) {
      recognized += amount;
      recognizedOrderCount += 1;
    }
  }

  return {
    total,
    recognized,
    unrecognized: total - recognized,
    orderCount,
    recognizedOrderCount,
    unrecognizedOrderCount: orderCount - recognizedOrderCount,
    recognizedRatio: total > 0 ? recognized / total : 0,
  };
}

// ---------------------------------------------------------------------------
// Phase 1 - Reporting Foundation. Everything below is ADDITIVE: it consolidates
// the purchase-row recognition rule that lib/reports/reports.service.ts used to
// keep as a private copy, and adds the shared "why" wording the drill-down
// datasets expose. No definition above this line was touched.
// ---------------------------------------------------------------------------

/** The shape of a `customer_purchases` row for recognition purposes: the
 * linked Order (through order_items) is embedded by the query. `order_items`
 * is null for a legacy row; it can also be non-null with `orders: null`
 * when the join finds no Order. */
export interface PurchaseRecognitionFields {
  order_item_id: string | null;
  order_items: { orders: OrderStatusFields | null } | null;
}

/** BR-001 + BR-002 (both LOCKED) applied to one customer_purchases row.
 *  - BR-002: no linked Order (order_item_id NULL - legacy / manual entry)
 *    -> recognized by exception.
 *  - BR-001: linked Order -> recognized only when that Order is Completed
 *    AND Paid; a linked row whose Order cannot be found is NOT recognized.
 * This is the verbatim rule of reports.service.ts's former private
 * isRevenueRecognized (proven equal by revenueDefinition.regression.test.ts). */
export function isPurchaseRecognized(row: PurchaseRecognitionFields): boolean {
  if (!row.order_item_id) return true;
  const order = row.order_items?.orders;
  return !!order && isOrderRecognized(order);
}

export type RecognitionRule = "BR-001" | "BR-002";

/** Which LOCKED rule recognizes a purchase row (null = not recognized). */
export function purchaseRecognitionRule(row: PurchaseRecognitionFields): RecognitionRule | null {
  if (!isPurchaseRecognized(row)) return null;
  return row.order_item_id ? "BR-001" : "BR-002";
}

/** Plain-Vietnamese wording of each rule, for detail views. */
export const RECOGNITION_RULE_LABEL: Record<RecognitionRule, string> = {
  "BR-001": "Đơn đã hoàn thành và thanh toán đủ",
  "BR-002": "Dữ liệu cũ, không gắn đơn hàng (ghi nhận theo quy tắc dữ liệu cũ)",
};

export type UnrecognizedReasonCode = "ORDER_DRAFT" | "ORDER_RESERVED" | "ORDER_NOT_FULLY_PAID" | "ORDER_LOST";

export interface UnrecognizedReason {
  code: UnrecognizedReasonCode;
  label: string;
}

/** Why a non-Lost Order is not recognized revenue. Derived ONLY from the
 * two fields BR-001 reads (order status, payment status) plus whether a
 * payment record exists - it never introduces a new condition. Returns
 * null for a recognized order. */
export function getUnrecognizedReason(order: OrderStatusFields, paymentCount: number): UnrecognizedReason | null {
  if (isOrderRecognized(order)) return null;
  if (order.order_status === "Lost") return { code: "ORDER_LOST", label: "Đơn đã mất, không tính doanh thu" };
  if (order.order_status === "Completed") {
    return { code: "ORDER_NOT_FULLY_PAID", label: "Đã hoàn thành nhưng chưa thanh toán đủ" };
  }
  if (order.order_status === "Reserved") {
    return {
      code: "ORDER_RESERVED",
      label: paymentCount > 0 ? "Đã giữ hàng và đã cọc, chưa hoàn thành" : "Đã giữ hàng, chưa cọc, chưa hoàn thành",
    };
  }
  return { code: "ORDER_DRAFT", label: "Đơn nháp, chưa hoàn thành" };
}
