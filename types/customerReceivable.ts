import { FinancialSettlementState } from "@/lib/orders/order.rules";

/** Customer Receivable (Finance Project #1, Phase E, Product Owner Approval
 * 2026-08-21) — a READ MODEL over the existing Order/Payment source of
 * truth (docs/07_REPORTING_SPEC.md §3: Reporting reads Orders/Payments
 * directly, never a second source of truth). One row per Order — Customer
 * is a column, not the grouping level, matching this report's own required
 * shape (Customer -> Order -> Total -> Paid -> Outstanding/Overpaid) and
 * this codebase's existing per-order report precedent (Payment Method
 * Report's own drill-down). No new table, no new ledger — remainingBalance/
 * settlementState/overpaidAmount all derive from calculateRemainingBalance/
 * deriveFinancialSettlementState/calculateOverpaidAmount
 * (lib/orders/order.rules.ts, already the Finance Project #1 Phase C
 * source of truth), reused verbatim, never re-derived. Payment history/
 * reference is deliberately NOT duplicated into a new UI here - the Order
 * Number links to the existing Order Detail page
 * (components/order/OrderPaymentsList.tsx), which already shows every
 * payment's date/amount/method/receiving account/note, including the
 * Overpaid badge Phase C added - rebuilding that here would violate "Do
 * not duplicate financial logic unnecessarily." */

export const CUSTOMER_RECEIVABLE_PAGE_SIZE = 50;

export interface CustomerReceivableFilters {
  /** Matches against customer name/code or Order Number, client-side
   * (same convention getOrderList/createSettlement's own search already
   * uses - see the repository's own doc comment). */
  searchTerm?: string;
  status?: FinancialSettlementState;
  /** Inclusive start, filtered against orders.order_date. */
  dateFrom?: string;
  /** Exclusive end, same field. */
  dateTo?: string;
  page?: number;
}

export interface CustomerReceivableRow {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  totalAmount: number;
  amountPaid: number;
  /** Total − Paid, unclamped (Finance Project #1 Phase C) - positive means
   * Outstanding, zero means Settled, negative means Overpaid. */
  remainingBalance: number;
  settlementState: FinancialSettlementState;
  /** Always >= 0 - the amount overpaid, or 0 when not Overpaid. */
  overpaidAmount: number;
  /** Every distinct payment_method actually recorded on the Order,
   * comma-joined (same shape as lib/reports/orderPaymentSummary.ts). */
  paymentMethods: string | null;
  paymentCount: number;
  lastPaymentDate: string | null;
}

export interface CustomerReceivableSummary {
  /** SUM(remainingBalance) over every Outstanding row in the current
   * filtered set (not just the current page). */
  totalOutstanding: number;
  /** SUM(overpaidAmount) over every Overpaid row in the current filtered
   * set. Never netted against totalOutstanding - Phase C's own rule that
   * overpayment must never silently offset debt elsewhere. */
  totalOverpaid: number;
  orderCount: number;
}

export interface CustomerReceivablePage {
  rows: CustomerReceivableRow[];
  totalCount: number;
  summary: CustomerReceivableSummary;
}
