import { addDaysToDateStr, DateRange } from "@/lib/dateFilter";

// Feature 8 - Drill-down. Every report card/row in the BI Center links here
// instead of duplicating Sales Ledger's own filtering: this only builds the
// query string, /reports/sales-ledger (see its page.tsx) reads it back into
// SalesLedgerFilters + the Global Date Filter on mount.
//
// dateFrom/dateTo travel as an exclusive DateRange (this module's own
// contract, matching lib/dateFilter.ts's DateRange) so a fixed period like
// "Today" or a Revenue Trend bucket can be reproduced exactly - Sales
// Ledger's page then folds them into the Global Date Filter's Custom Range
// (customTo is inclusive there, hence the -1 day conversion at the read
// side, not here).

export interface DrilldownFilters {
  dateRange?: DateRange | null;
  customerCode?: string;
  productCode?: string;
  productCategory?: string;
  salespersonId?: string;
}

export function buildSalesLedgerHref(filters: DrilldownFilters): string {
  const params = new URLSearchParams();

  if (filters.dateRange) {
    params.set("dateFrom", filters.dateRange.start);
    params.set("dateTo", filters.dateRange.end);
  }
  if (filters.customerCode) params.set("customer", filters.customerCode);
  if (filters.productCode) params.set("productCode", filters.productCode);
  if (filters.productCategory) params.set("productCategory", filters.productCategory);
  if (filters.salespersonId) params.set("salespersonId", filters.salespersonId);

  const query = params.toString();
  return query ? `/reports/sales-ledger?${query}` : "/reports/sales-ledger";
}

/** Inclusive "to" date for the Global Date Filter's Custom Range input,
 * derived from an exclusive DateRange.end - the exact inverse of
 * getDateRange()'s custom-range end = to + 1 day. */
export function exclusiveEndToInclusiveTo(end: string): string {
  return addDaysToDateStr(end, -1);
}
