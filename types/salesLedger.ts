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
  /** Sprint v2.3.0 (Data Verification Center) - Features 2/3/4. Present on
   * every row regardless of mode; only surfaced in the UI when Verification
   * Mode is on. `is_duplicate` is the one computed (non-stored) column on
   * the view - Feature 4's exact rule (same customer/product/sale_date/
   * sale_amount), never auto-merged or deleted, warning only. */
  entry_source: EntrySource;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
  is_duplicate: boolean;
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
