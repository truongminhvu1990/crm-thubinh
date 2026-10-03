import { SupabaseClient } from "@supabase/supabase-js";
import { MonthlySoldProductsFilters } from "@/types/monthlySoldProducts";
import { Staff } from "@/types/staff";
import * as repo from "./monthlySoldProducts.repository";

// Phase 1 - Reporting Foundation: the canonical SOLD dataset.
//
// The Sold POPULATION is untouched - it is whatever repo.getSoldLines returns
// (LOCKED definition in lib/reports/revenueDefinition.ts isSoldOrder:
// Completed, OR Reserved with >= 1 real payment record; Draft / Reserved
// without a payment / Lost are not sold; plus BR-002 legacy entries). This
// module only SUMMARIZES and GROUPS those lines. The Monthly Sold Products
// Summary (service.getMonthlySoldProductsSummary), the Overview's "Đã bán"
// metric and the Sold drill-downs all call summarizeSoldLines, so the card,
// the report and the detail can never compute Sold differently.

export interface SoldTotals {
  /** = recognizedRevenue + unrecognizedValue, exactly (LOCKED unification). */
  soldValue: number;
  /** BR-001 + BR-002 recognized part of the sold lines. */
  recognizedRevenue: number;
  /** The BR-002 legacy portion already INCLUDED in recognizedRevenue. */
  legacyRecognizedValue: number;
  unrecognizedValue: number;
  soldLines: number;
  totalCustomers: number;
  /** Distinct sold Orders, each legacy entry counted as its own single-item
   * "order" (unchanged from the report's pre-existing behavior). */
  totalOrders: number;
  recognizedOrders: number;
  unrecognizedOrders: number;
  recognizedRatio: number;
  /** Order ids of the recognized sold lines (legacy entries have no order). */
  recognizedOrderIds: string[];
}

type SoldLine = repo.SoldLine;

/** Pure. Verbatim the arithmetic getMonthlySoldProductsSummary has always
 * used for these fields, moved here so every consumer shares it. */
export function summarizeSoldLines(lines: SoldLine[]): SoldTotals {
  let recognizedRevenue = 0;
  let legacyRecognizedValue = 0;
  let unrecognizedValue = 0;
  for (const l of lines) {
    if (l.recognition === "recognized") {
      recognizedRevenue += l.final_sale_price;
      if (l.is_legacy) legacyRecognizedValue += l.final_sale_price;
    } else unrecognizedValue += l.final_sale_price;
  }
  const soldValue = recognizedRevenue + unrecognizedValue;

  const totalCustomers = new Set(lines.map((l) => l.customer_id)).size;

  const recognizedOrderIds = new Set<string>();
  const unrecognizedOrderIds = new Set<string>();
  let legacyCount = 0;
  for (const l of lines) {
    if (l.order_id === null) legacyCount += 1;
    else if (l.recognition === "recognized") recognizedOrderIds.add(l.order_id);
    else unrecognizedOrderIds.add(l.order_id);
  }
  const recognizedOrders = recognizedOrderIds.size + legacyCount;
  const unrecognizedOrders = unrecognizedOrderIds.size;

  return {
    soldValue,
    recognizedRevenue,
    legacyRecognizedValue,
    unrecognizedValue,
    soldLines: lines.length,
    totalCustomers,
    totalOrders: recognizedOrders + unrecognizedOrders,
    recognizedOrders,
    unrecognizedOrders,
    recognizedRatio: soldValue > 0 ? recognizedRevenue / soldValue : 0,
    recognizedOrderIds: [...recognizedOrderIds],
  };
}

export interface SoldOrderRow {
  /** null for a BR-002 legacy entry (no Order). */
  order_id: string | null;
  order_number: string | null;
  /** Order date for an Order; sale_date for a legacy entry (the report's
   * own date basis). */
  order_date: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  salesperson: string | null;
  order_status: string | null;
  payment_status: string | null;
  is_legacy: boolean;
  recognition: "recognized" | "unrecognized";
  /** Number of sold product lines in this order. */
  product_count: number;
  /** Sum of the order's sold lines' final_sale_price - the Sold value basis,
   * so the rows sum to SoldTotals.soldValue exactly. */
  sold_value: number;
  /** Order-level payment figures (null for a legacy entry). */
  amount_paid: number | null;
  remaining_balance: number | null;
  payment_methods: string | null;
}

/** Pure. Groups sold lines into one row per Order (each legacy entry is its
 * own row). Newest first, same ordering rule as getSoldLines. */
export function groupSoldLinesByOrder(lines: SoldLine[]): SoldOrderRow[] {
  const byKey = new Map<string, SoldOrderRow>();
  for (const l of lines) {
    const key = l.order_id ?? `legacy:${l.line_key}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.product_count += 1;
      existing.sold_value += l.final_sale_price;
      continue;
    }
    byKey.set(key, {
      order_id: l.order_id,
      order_number: l.order_number,
      order_date: l.sale_date,
      customer_id: l.customer_id,
      customer_name: l.customer_name,
      customer_code: l.customer_code,
      salesperson: l.salesperson,
      order_status: l.order_status,
      payment_status: l.payment_status,
      is_legacy: l.is_legacy,
      recognition: l.recognition,
      product_count: 1,
      sold_value: l.final_sale_price,
      amount_paid: l.amount_paid,
      remaining_balance: l.remaining_balance,
      payment_methods: l.payment_methods,
    });
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.order_date !== b.order_date) return a.order_date < b.order_date ? 1 : -1;
    const an = a.order_number ?? "";
    const bn = b.order_number ?? "";
    return an === bn ? 0 : an < bn ? 1 : -1;
  });
}

/** Lean canonical "Đã bán" figure for the Overview: one getSoldLines call,
 * no expense / commission / role lookups. */
export async function getSoldTotals(
  filters: MonthlySoldProductsFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<SoldTotals> {
  return summarizeSoldLines(await repo.getSoldLines(filters, client, staff));
}

/** Both views of the Sold population from ONE getSoldLines call, so the
 * product view, the order view and the totals are the same set by
 * construction. `lines` are the raw SoldLines (service strips cost fields
 * and applies the gross-profit permission before anything leaves the
 * server). */
export async function getSoldDataset(
  filters: MonthlySoldProductsFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<{ totals: SoldTotals; orders: SoldOrderRow[]; lines: SoldLine[]; itemless: repo.SoldItemlessOrder[] }> {
  const { lines, itemless } = await repo.getSoldLinesWithItemless(filters, client, staff);
  // totals / orders / lines are computed from the sold LINES exactly as before; `itemless` is display-only.
  return { totals: summarizeSoldLines(lines), orders: groupSoldLinesByOrder(lines), lines, itemless };
}
