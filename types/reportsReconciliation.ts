/** E-3 — Unified Revenue Reconciliation View
 * (docs/REPORTING_MASTER_SPEC.md §10, Decision Q-2, Revision 3).
 * Compares Reports' `customer_purchases`/`sales_ledger`-based computation
 * path ("Path A") against Business Intelligence's `orders`-based,
 * BR-001-gated path ("Path B") for the same shared period — the exact two
 * metrics §3.7/§3.11 of the Master Spec confirmed are computed by genuinely
 * different code paths today. No new revenue definition is introduced here
 * — both values are read from each system's own existing, unmodified
 * computation. */

export type ReconciliationStatus = "Reconciled" | "Discrepancy Found";

export interface RevenueReconciliation {
  reportsRevenue: number;
  biRevenue: number;
  delta: number;
  deltaPercent: number | null; // null when biRevenue is 0 (percent undefined)
  status: ReconciliationStatus;
}

export interface CustomerReconciliationRow {
  customerId: string;
  customerName: string;
  customerCode: string;
  reportsRevenue: number | null; // null = this customer didn't appear in Path A's top-N
  biRevenue: number | null; // null = this customer didn't appear in Path B's top-N
  delta: number; // reportsRevenue - biRevenue, treating a missing side as 0
}

export interface ReportsReconciliation {
  revenue: RevenueReconciliation;
  topCustomers: CustomerReconciliationRow[];
}
