import { DateRange } from "@/lib/dateFilter";
import type { PriceBandRow } from "./composition";

// Dashboard Wave B drill-down links. Pure URL builders: every value goes through URLSearchParams (encoded, never concatenated), and the
// parameter names are exactly the whitelisted ones the target pages read (Sales Ledger: dateFrom, dateTo, productId, productCategory,
// uncategorized, minAmount, maxAmountExclusive, recognizedOnly; Inventory report: view, category, uncategorized).
//
// F4 / F5 / F8 open the Sales Ledger over the Dashboard's own date range (dateTo exclusive, as in lib/reports/drilldown.ts) and always with
// recognizedOnly=1, so the ledger lists exactly the recognized rows the clicked bar was made of. F9 opens the Inventory report, which is
// current-state data: it never carries a date.

function ledgerParams(range: DateRange | null): URLSearchParams {
  const p = new URLSearchParams();
  if (range) {
    p.set("dateFrom", range.start);
    p.set("dateTo", range.end);
  }
  p.set("recognizedOnly", "1");
  return p;
}

const ledger = (p: URLSearchParams) => `/reports/sales-ledger?${p.toString()}`;

/** F4: one product. null when the group is not a real product (unknown product) - there is nothing exact to open. */
export function productLedgerHref(productId: string | null, range: DateRange | null): string | null {
  if (!productId) return null;
  const p = ledgerParams(range);
  p.set("productId", productId);
  return ledger(p);
}

/** F5: one category. `null` category = "Chưa phân loại". */
export function categoryLedgerHref(category: string | null, range: DateRange | null): string {
  const p = ledgerParams(range);
  if (category === null) p.set("uncategorized", "1");
  else p.set("productCategory", category);
  return ledger(p);
}

/** F8: one price band, [min, maxExclusive). "Không có giá" has no exact ledger filter (a missing / non-positive amount), so it has no link. */
export function priceBandLedgerHref(band: Pick<PriceBandRow, "key" | "min" | "maxExclusive">, range: DateRange | null): string | null {
  if (band.key === "noPrice") return null;
  const p = ledgerParams(range);
  if (band.min !== null) p.set("minAmount", String(band.min));
  if (band.maxExclusive !== null) p.set("maxAmountExclusive", String(band.maxExclusive));
  return ledger(p);
}

/** F9: one category within Held or Remaining. No date: inventory is the current state. */
export function inventoryCategoryHref(view: "held" | "remaining", category: string | null): string {
  const p = new URLSearchParams({ view });
  if (category === null) p.set("uncategorized", "1");
  else p.set("category", category);
  return `/reports/inventory?${p.toString()}`;
}
