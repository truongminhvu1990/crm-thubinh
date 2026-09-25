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
