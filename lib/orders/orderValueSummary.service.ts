import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DateRange } from "@/lib/dateFilter";
import { applyDataScopeByName } from "@/lib/permission/dataScope";
import type { ScopingStaff } from "./order.repository";

/** Revenue Management Visibility (2026-08-29), Order Revenue Visibility
 * Semantic Gap fix (2026-08-29 follow-up) — this module owns BOTH figures
 * for the Orders population: Total Order Value ("Tổng giá trị đơn hàng",
 * B1) and, since the semantic-gap fix, the Orders-population's own
 * Recognized/Unrecognized split (`orderBasedRecognizedValue` /
 * `orderBasedUnrecognizedValue`, i.e. B3 — "Giá trị đơn chưa ghi nhận").
 * All three come from the exact same single scoped query below — never
 * three separately-drifting computations.
 *
 * Deliberately NOT reused for B3: `getPurchaseReportData()`'s
 * `totalRevenue` (`lib/reports/reports.service.ts`) — the Dashboard's
 * unchanged Recognized Revenue KPI (B2). That figure also counts BR-002
 * legacy `customer_purchases` rows with no linked Order at all (a real,
 * confirmed-on-Dev scenario — 2 such rows exist there). B1's population is
 * exclusively `orders`, so `B1 − B2` is not, in general, "the value of
 * Orders not yet recognized" — it also nets out however much of B2 came
 * from legacy rows outside the Orders population entirely. B3 is instead
 * computed as the Completed+Paid complement WITHIN this same orders query
 * (`orderBasedUnrecognizedValue = totalOrderValue −
 * orderBasedRecognizedValue`, and `breakdown` sums to exactly that), so
 * `totalOrderValue = orderBasedRecognizedValue + orderBasedUnrecognizedValue`
 * holds exactly, always — an Orders-population-only identity, independent
 * of whatever legacy revenue B2 separately reports. BR-001 itself
 * (Completed AND Paid) is not re-defined here — it's the same two-field
 * check `getPurchaseReportData()`'s `isRevenueRecognized()` applies to a
 * linked order; this module just applies it directly to `orders` rows
 * instead of via a `customer_purchases` join, since there is no
 * `customer_purchases` row in scope here at all. */

export interface OrderValueBreakdownRow {
  order_status: string;
  payment_status: string;
  count: number;
  total: number;
}

export interface OrderValueSummary {
  /** SUM(orders.total_amount) for every non-Lost order whose order_date
   * falls in the given range — "Tổng giá trị đơn hàng". No payment_status
   * filter (B1, LOCKED by this task's own directive). */
  totalOrderValue: number;
  totalOrderCount: number;
  /** The Completed+Paid subset of totalOrderValue — BR-001 applied
   * directly to `orders`, never via `customer_purchases`. Exposed for
   * reconciliation/verification only (e.g. cross-checking against B2's own
   * Order-linked subset); the Dashboard's Recognized Revenue KPI (B2)
   * stays exclusively `getPurchaseReportData()`'s figure. */
  orderBasedRecognizedValue: number;
  /** B3 — "Giá trị đơn chưa ghi nhận". = totalOrderValue −
   * orderBasedRecognizedValue, computed within the Orders population only
   * (never nets out B2's legacy BR-002 revenue). Equals the sum of
   * `breakdown` below, by construction. */
  orderBasedUnrecognizedValue: number;
  /** Every non-Lost order in range EXCEPT Completed+Paid ones, grouped by
   * (order_status, payment_status) — dynamically computed, never hardcoded.
   * Sum of this array's `total` fields = orderBasedUnrecognizedValue
   * exactly (same query, same rows — not a separate computation that could
   * drift). This is the drill-down for "Giá trị đơn chưa ghi nhận". */
  breakdown: OrderValueBreakdownRow[];
}

const EMPTY_SUMMARY: OrderValueSummary = {
  totalOrderValue: 0,
  totalOrderCount: 0,
  orderBasedRecognizedValue: 0,
  orderBasedUnrecognizedValue: 0,
  breakdown: [],
};

interface OrderValueRow {
  order_status: string;
  payment_status: string;
  total_amount: number;
}

/** Total Order Value + its non-recognized breakdown for the Orders table
 * directly (`order_date`-based — B1's own explicit instruction: use the
 * Order model's own date, never `sale_date`, and never silently switch
 * either side's date semantics). Lost orders are excluded at the query
 * level (B1: "Exclude Lost orders unless the existing LOCKED specification
 * explicitly requires otherwise" — no such requirement was found in
 * `docs/03_ORDER_SPEC.md`). `staff` is optional and, when provided, scopes
 * to Own/Team/All via the same `applyDataScopeByName(..., "orders",
 * "sales_owner", ...)` call `findAllOrders()` (order.repository.ts)
 * already uses — the exact same resource key and ownership field, so this
 * widget's visibility never diverges from `/orders`' own. */
export async function getOrderValueSummary(
  range: DateRange | null,
  staff?: ScopingStaff | null,
  client: SupabaseClient = supabase
): Promise<OrderValueSummary> {
  let query = client.from("orders").select("order_status, payment_status, total_amount").neq("order_status", "Lost");

  if (range) query = query.gte("order_date", range.start).lt("order_date", range.end);
  if (staff) query = (await applyDataScopeByName(query, staff, "orders", "sales_owner", client)).query;

  const { data, error } = await query;
  if (error || !data) {
    if (error) console.error("Error fetching order value summary:", error);
    return EMPTY_SUMMARY;
  }

  const rows = data as unknown as OrderValueRow[];
  let totalOrderValue = 0;
  let orderBasedRecognizedValue = 0;
  const breakdownMap = new Map<string, OrderValueBreakdownRow>();

  for (const row of rows) {
    const amount = Number(row.total_amount) || 0;
    totalOrderValue += amount;

    const isCompletedPaid = row.order_status === "Completed" && row.payment_status === "Paid";
    if (isCompletedPaid) {
      orderBasedRecognizedValue += amount;
      continue;
    }

    const key = `${row.order_status}|${row.payment_status}`;
    const entry = breakdownMap.get(key) ?? { order_status: row.order_status, payment_status: row.payment_status, count: 0, total: 0 };
    entry.count += 1;
    entry.total += amount;
    breakdownMap.set(key, entry);
  }

  return {
    totalOrderValue,
    totalOrderCount: rows.length,
    orderBasedRecognizedValue,
    orderBasedUnrecognizedValue: totalOrderValue - orderBasedRecognizedValue,
    breakdown: Array.from(breakdownMap.values()).sort((a, b) => b.total - a.total),
  };
}
