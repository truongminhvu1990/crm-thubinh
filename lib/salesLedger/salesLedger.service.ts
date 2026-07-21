import { DateRange } from "@/lib/dateFilter";
import { SalesLedgerFilters, SalesLedgerRow, SalesLedgerSummary } from "@/types/salesLedger";
import * as repo from "./salesLedger.repository";

// Business logic / composition only - SalesLedgerRepository owns every
// direct Supabase call. Nothing here recomputes sale_amount or commission -
// both are read straight from the sales_ledger view (customer_purchases /
// sales_commissions respectively).

/** Merges the app's Global Date Filter range into a filters object -
 * Sales Ledger MUST always use the same selected period as
 * Dashboard/Reports, so this is the one and only place `range` gets
 * translated into `dateFrom`/`dateTo`. `range: null` (the filter's
 * "Toàn thời gian" / All Time option) means no date bound at all. */
export function withGlobalDateRange(
  filters: Omit<SalesLedgerFilters, "dateFrom" | "dateTo">,
  range: DateRange | null
): SalesLedgerFilters {
  return {
    ...filters,
    dateFrom: range?.start,
    dateTo: range?.end,
  };
}

async function withProductImages(rows: SalesLedgerRow[]): Promise<SalesLedgerRow[]> {
  const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id))];
  if (productIds.length === 0) return rows;

  const images = await repo.getPrimaryImagesByProductIds(productIds);
  return rows.map((r) => ({
    ...r,
    product_image_url: r.product_id ? images.get(r.product_id) || null : null,
  }));
}

export async function getSalesLedgerPage(filters: SalesLedgerFilters) {
  const { rows, totalCount } = await repo.getSalesLedgerPage(filters);
  return { rows: await withProductImages(rows), totalCount };
}

export async function getSalesLedgerDetail(purchaseId: string): Promise<SalesLedgerRow | null> {
  const row = await repo.getSalesLedgerRowByPurchaseId(purchaseId);
  if (!row) return null;
  const [withImage] = await withProductImages([row]);
  return withImage;
}

export async function getSalesLedgerDetailImages(productId: string) {
  return repo.getProductImagesForProduct(productId);
}

/** Feature 3 - Summary, computed over every currently-filtered row (not
 * just the visible page of 50). */
export function summarizeSalesLedgerRows(
  rows: { sale_amount: number; commission_amount: number | null }[]
): SalesLedgerSummary {
  const totalTransactions = rows.length;
  const totalRevenue = rows.reduce((sum, r) => sum + (Number(r.sale_amount) || 0), 0);
  const totalCommission = rows.reduce((sum, r) => sum + (Number(r.commission_amount) || 0), 0);
  return {
    totalTransactions,
    totalRevenue,
    totalCommission,
    averageSale: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
  };
}

export async function getSalesLedgerSummary(filters: SalesLedgerFilters): Promise<SalesLedgerSummary> {
  const rows = await repo.getSalesLedgerAggregateRows(filters);
  return summarizeSalesLedgerRows(rows);
}

/** Feature "Export Excel" - every currently-filtered row (Feature spec's
 * explicit "only export currently filtered rows"), not just the visible
 * page. Re-runs the same filtered query, walking every 50-row page rather
 * than adding a second, separately-shaped "fetch everything" query - keeps
 * exactly one code path building the sales_ledger query. */
export async function getAllFilteredRowsForExport(filters: SalesLedgerFilters): Promise<SalesLedgerRow[]> {
  const rows: SalesLedgerRow[] = [];
  let page = 1;
  for (;;) {
    const { rows: chunk, totalCount } = await repo.getSalesLedgerPage({ ...filters, page });
    rows.push(...chunk);
    if (rows.length >= totalCount || chunk.length === 0) break;
    page += 1;
  }
  return rows;
}
