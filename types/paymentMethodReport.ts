/** Payment Method Report (docs/07_REPORTING_SPEC.md §10, Operational
 * Reporting) — answers "which payment methods is revenue currently coming
 * in through," reading the `payments` table (Orders/Payment module,
 * `docs/04_PAYMENT_SPEC.md`) directly. Payment Method itself is never a
 * fixed enum here — `payments.payment_method` is free text, backed in the
 * UI by the `payment_method` master-data category (AddPaymentModal), so
 * this report groups by whatever distinct values actually exist on
 * payment records, never a hardcoded list. */

export interface PaymentMethodReportFilters {
  /** "YYYY-MM" — mutually exclusive with dateFrom/dateTo in the UI (picking
   * one clears the other), but the repository accepts both independently;
   * the service resolves month into a dateFrom/dateTo pair before querying. */
  month?: string;
  /** Inclusive start, filtered against payments.payment_date (the
   * authoritative business date for a Payment record — see repository doc
   * comment for why this is used instead of payments.created_at or any
   * Order/customer_purchases date field). */
  dateFrom?: string;
  /** Exclusive end, same field. */
  dateTo?: string;
  /** Matches against the owning Order's sales_owner (text field, no
   * salesperson_id FK exists on orders — see order.repository.ts). */
  salesperson?: string;
  /** Exact match against payments.payment_method. */
  paymentMethod?: string;
}

export interface PaymentMethodReportRow {
  paymentMethod: string;
  orderCount: number;
  paymentCount: number;
  totalAmount: number;
}

/** Drill-down (Product Owner task, 2026-08-14) - the real Orders/Order
 * Items behind one payment-method summary row ("Tiền mặt" -> "4 đơn" ->
 * these rows). One row per order_item - a multi-product Order is never
 * collapsed into a single row. Reads orders/order_items/payments/products/
 * customers directly (same tables the summary already reads), never
 * customer_purchases.
 *
 * amountPaid/remainingBalance/paymentMethods are Order-level (see
 * lib/reports/orderPaymentSummary.ts) - every item row belonging to the
 * same Order shows that Order's own totals. paymentMethods lists every
 * distinct method actually recorded on the Order, which may include methods
 * other than the one just drilled into (a split-payment Order legitimately
 * appears under more than one method's drill-down) - shown accurately
 * rather than filtered down to only the selected method. */
export interface PaymentMethodDrillDownRow {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  customerId: string;
  customerName: string;
  customerCode: string;
  saleAmount: number;
  amountPaid: number;
  remainingBalance: number;
  paymentMethods: string | null;
}
