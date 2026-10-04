import { addDaysToDateStr, DateRange } from "@/lib/dateFilter";

// Feature 8 - Drill-down. Every report card/row in the BI Center links here
// instead of duplicating Sales Ledger's own filtering: this only builds the
// query string, /reports/sales-ledger (see its page.tsx) reads it back into
// SalesLedgerFilters on mount. Phase 1.6B: the date part is VIEW context for that page only - it never overwrites the
// user's saved Global Date Filter (see parseDrilldownRange / activeDrilldownRange below).
//
// dateFrom/dateTo travel as an exclusive DateRange (this module's own
// contract, matching lib/dateFilter.ts's DateRange) so a fixed period like
// "Today" or a Revenue Trend bucket can be reproduced exactly - Sales
// Ledger's page then uses them as its own view range (end stays exclusive).

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

/** A drill-down's date range held by a page as VIEW context. `baseKey` is the Global Date Filter period (`periodKey`)
 * that was active when the link was opened, or null until that is known. */
export interface DrilldownView {
  range: DateRange;
  baseKey: string | null;
}

/** Reads ?dateFrom=&dateTo= (end exclusive). Both must be present; anything else is not a drill-down range. */
export function parseDrilldownRange(params: { get(name: string): string | null }): DrilldownView | null {
  const from = params.get("dateFrom");
  const to = params.get("dateTo");
  return from && to ? { range: { start: from, end: to }, baseKey: null } : null;
}

/** The drill-down range that is in force right now, or null. It holds only while the Global Date Filter is still on the
 * period it was opened over: choosing another period hands control back to the filter. */
export function activeDrilldownRange(view: DrilldownView | null, periodKey: string): DateRange | null {
  if (!view) return null;
  return view.baseKey === null || view.baseKey === periodKey ? view.range : null;
}

/** Inclusive "to" date for the Global Date Filter's Custom Range input,
 * derived from an exclusive DateRange.end - the exact inverse of
 * getDateRange()'s custom-range end = to + 1 day. */
export function exclusiveEndToInclusiveTo(end: string): string {
  return addDaysToDateStr(end, -1);
}
