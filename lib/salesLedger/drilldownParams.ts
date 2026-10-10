import { SalesLedgerFilters } from "@/types/salesLedger";

// Dashboard Wave B drill-down: the four additive Sales Ledger filters, parsed from a query string. WHITELISTED: each parameter has one
// fixed meaning and a strict value shape, so a client can never name a column, an operator or a SQL fragment through them.
//
//   productId           exact products.id, a UUID (anything else is rejected)
//   uncategorized       "1" | "true" switches it on; every other value leaves it off
//   maxAmountExclusive  a finite number >= 0 (upper bound, exclusive); anything else is rejected
//   recognizedOnly      "1" | "true" switches it on; every other value leaves it off
//
// Used by /api/sales-ledger, /api/sales-ledger/export and the Sales Ledger page, so all three read the URL the same way.

export const DRILLDOWN_FILTER_KEYS = ["productId", "uncategorized", "maxAmountExclusive", "recognizedOnly"] as const;

export type DrilldownFilterFields = Pick<SalesLedgerFilters, "productId" | "uncategorized" | "maxAmountExclusive" | "recognizedOnly">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isOn = (value: string | null) => value === "1" || value === "true";

export function parseSalesLedgerDrilldownParams(params: { get(name: string): string | null; has(name: string): boolean }): { filters: DrilldownFilterFields } | { error: string } {
  const filters: DrilldownFilterFields = {};

  const productId = params.get("productId");
  if (productId !== null && productId !== "") {
    if (!UUID.test(productId)) return { error: "productId must be a valid UUID" };
    filters.productId = productId;
  }

  if (isOn(params.get("uncategorized"))) filters.uncategorized = true;
  if (isOn(params.get("recognizedOnly"))) filters.recognizedOnly = true;

  if (params.has("maxAmountExclusive")) {
    const raw = params.get("maxAmountExclusive");
    const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: "maxAmountExclusive must be a finite number >= 0" };
    filters.maxAmountExclusive = n;
  }

  return { filters };
}
