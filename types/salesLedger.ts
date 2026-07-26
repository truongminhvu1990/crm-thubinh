import { CommissionStatus } from "./commission";

/** Sprint v2.3.0 - Data Verification Center. Live Sale = entered through
 * the app's normal purchase-entry flow (the default); Historical Import =
 * backfilled by an operator. */
export type EntrySource = "Live Sale" | "Historical Import";

/** One row of the `sales_ledger` view - a straight read-only projection of
 * customer_purchases + customers + products + sales_commissions. Every
 * amount here is copied verbatim from its source table; nothing on this
 * type is ever computed by this feature. */
export interface SalesLedgerRow {
  purchase_id: string;
  customer_id: string;
  product_id: string | null;
  sale_amount: number;
  sale_date: string;
  note: string | null;
  salesperson: string | null;
  salesperson_id: string | null;
  purchase_created_at: string;
  customer_name: string;
  customer_code: string;
  product_code: string | null;
  product_name: string | null;
  product_category: string | null;
  commission_id: string | null;
  commission_percent: number | null;
  commission_amount: number | null;
  commission_status: CommissionStatus | null;
  /** Resolved separately (product_images), not part of the view - see
   * salesLedger.repository.ts. */
  product_image_url?: string | null;
  /** Sprint v2.3.0 (Data Verification Center) - Features 2/3/4; only
   * surfaced in the UI when Verification Mode is on. Optional, not just
   * nullable: the view only projects these once 20260725_data_
   * verification_module.sql has run, which Production's schema confirms
   * it has not, so `select("*")` against the live view simply omits the
   * keys - `undefined`, not `null`. Every reader must treat them as
   * possibly absent until that migration (or an equivalent one) lands.
   * `is_duplicate` is the one computed (non-stored) column on the view -
   * Feature 4's exact rule (same customer/product/sale_date/sale_amount),
   * never auto-merged or deleted, warning only - and is present on every
   * schema since it only depends on columns that always exist. */
  entry_source?: EntrySource;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string;
  is_duplicate: boolean;
  /** BR-001 Revenue Recognition (docs/ORDERS_SPEC.md "Business Rule Lock",
   * LOCKED): true when this purchase has no linked Order (pre-Orders /
   * manual entry - the rule doesn't apply) or its Order is Completed AND
   * Paid. False means the row exists but hasn't earned recognized-revenue
   * status yet (e.g. Completed but only Partially Paid). Row-level display
   * is unaffected - only "revenue" totals gate on this column. */
  is_revenue_recognized: boolean;
}

export type SalesLedgerSortField = "sale_date" | "sale_amount" | "commission_amount";
export type SortDirection = "asc" | "desc";

export interface SalesLedgerFilters {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  customer?: string;
  salespersonId?: string;
  productCode?: string;
  productName?: string;
  productCategory?: string;
  minAmount?: number;
  maxAmount?: number;
  commissionStatus?: CommissionStatus;
  /** Sprint v2.3.0 (Data Verification Center), Feature 7 - only ever set
   * from Verification Mode's own filter panel; Normal Mode never sets
   * these, so this addition changes nothing about today's Sales Ledger. */
  entrySource?: EntrySource;
  createdBy?: string;
  updatedBy?: string;
  duplicateOnly?: boolean;
  sortField: SalesLedgerSortField;
  sortDirection: SortDirection;
  page: number;
}

export const SALES_LEDGER_PAGE_SIZE = 50;

export interface SalesLedgerPage {
  rows: SalesLedgerRow[];
  totalCount: number;
}

export interface SalesLedgerSummary {
  totalTransactions: number;
  totalRevenue: number;
  totalCommission: number;
  averageSale: number;
}
