import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DateRange } from "@/lib/dateFilter";
import { applyDataScopeByName } from "@/lib/permission/dataScope";
import type { ScopingStaff } from "./order.repository";
import {
  getUnrecognizedReason,
  isOrderRecognized,
  isSoldOrder,
  summarizeRevenue,
  UnrecognizedReason,
} from "@/lib/reports/revenueDefinition";
import { deriveOrderPaymentSummary } from "@/lib/reports/orderPaymentSummary";
import { fetchAllRows, selectIn } from "@/lib/reports/selectIn";

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
  /** Revenue & Sales Reporting Unification - order counts for the same
   * populations (`totalOrderCount` = recognized + unrecognized) and the
   * recognized share of Total Order Value in [0, 1]. All derived by
   * `summarizeRevenue()` (lib/reports/revenueDefinition.ts), the single
   * shared definition. */
  recognizedOrderCount: number;
  unrecognizedOrderCount: number;
  recognizedRatio: number;
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
  recognizedOrderCount: 0,
  unrecognizedOrderCount: 0,
  recognizedRatio: 0,
  breakdown: [],
};

/** One scoped, non-Lost order as the canonical loader returns it. Only
 * order_status / payment_status / total_amount feed any figure; the rest
 * identifies the order in the drill-down views. */
interface OrderValueRow {
  id?: string;
  order_number?: string;
  order_date?: string;
  customer_id?: string;
  customer?: { full_name: string; customer_code: string } | { full_name: string; customer_code: string }[] | null;
  order_status: string;
  payment_status: string;
  total_amount: number;
}

/** Phase 1 - Reporting Foundation. The ONE query behind "Tổng giá trị đơn
 * hàng" and "Giá trị đơn chưa ghi nhận": every non-Lost order whose
 * `order_date` falls in the range, Data-Scoped exactly as /orders is.
 * getOrderValueSummary (the Dashboard figures) and both drill-down datasets
 * below read through this, so their totals cannot disagree. Returns null on a
 * query error (callers degrade to the empty result, as before).
 *
 * Phase 1.2: read through fetchAllRows (paged, ordered by the unique `id`), so
 * a range holding more orders than PostgREST's max-rows cap (default 1000) is
 * still summed COMPLETELY instead of being silently truncated. Filters, data
 * scope and date basis are exactly what they were. */
async function loadOrderValueOrders(
  range: DateRange | null,
  staff: ScopingStaff | null | undefined,
  client: SupabaseClient
): Promise<OrderValueRow[] | null> {
  const { data, error } = await fetchAllRows<OrderValueRow>(
    client,
    "orders",
    "id, order_number, order_date, order_status, payment_status, total_amount, customer_id, customer:customers(full_name, customer_code)",
    async (base) => {
      let query = base.neq("order_status", "Lost");
      if (range) query = query.gte("order_date", range.start).lt("order_date", range.end);
      if (staff) query = (await applyDataScopeByName(query, staff, "orders", "sales_owner", client)).query;
      return { query };
    }
  );
  if (error || !data) {
    if (error) console.error("Error fetching order value summary:", error);
    return null;
  }
  return data;
}

/** Pure: Total / Recognized / Unrecognized / breakdown from already-loaded
 * orders. The only place these figures are computed. */
export function summarizeOrderValueRows(rows: OrderValueRow[]): OrderValueSummary {
  const revenue = summarizeRevenue(rows.map((row) => ({ ...row, amount: row.total_amount })));
  const breakdownMap = new Map<string, OrderValueBreakdownRow>();

  for (const row of rows) {
    if (isOrderRecognized(row)) continue;

    const amount = Number(row.total_amount) || 0;
    const key = `${row.order_status}|${row.payment_status}`;
    const entry = breakdownMap.get(key) ?? { order_status: row.order_status, payment_status: row.payment_status, count: 0, total: 0 };
    entry.count += 1;
    entry.total += amount;
    breakdownMap.set(key, entry);
  }

  return {
    totalOrderValue: revenue.total,
    totalOrderCount: revenue.orderCount,
    orderBasedRecognizedValue: revenue.recognized,
    orderBasedUnrecognizedValue: revenue.unrecognized,
    recognizedOrderCount: revenue.recognizedOrderCount,
    unrecognizedOrderCount: revenue.unrecognizedOrderCount,
    recognizedRatio: revenue.recognizedRatio,
    breakdown: Array.from(breakdownMap.values()).sort((a, b) => b.total - a.total),
  };
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
  const rows = await loadOrderValueOrders(range, staff, client);
  return rows ? summarizeOrderValueRows(rows) : EMPTY_SUMMARY;
}

// ---------------------------------------------------------------------------
// Phase 1 - Reporting Foundation: drill-down datasets. Both are built from
// the SAME rows getOrderValueSummary summarizes, plus the Order's real
// payment records for the paid / remaining / "is there a payment" columns.
// ---------------------------------------------------------------------------

export interface OrderValueDetailRow {
  order_id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer_name: string;
  customer_code: string | null;
  order_status: string;
  payment_status: string;
  order_total: number;
  /** Sum of the Order's real `payments` rows (payments.amount > 0). */
  paid_amount: number;
  remaining_amount: number;
  payment_count: number;
  /** BR-001 (Completed + Paid) - the SAME check the summary applies. */
  recognized: boolean;
  /** LOCKED Sold definition (Completed, or Reserved with >= 1 payment
   * record). Informational on this view - Total Order Value is NOT Sold. */
  sold: boolean;
  /** null for a recognized order. */
  unrecognized_reason: UnrecognizedReason | null;
}

export interface OrderValueDetail {
  /** The identical object getOrderValueSummary returns for the same inputs. */
  summary: OrderValueSummary;
  /** = summary.totalOrderValue, and also = the sum of `rows[].order_total`. */
  total: number;
  count: number;
  rows: OrderValueDetailRow[];
}

export interface UnrecognizedOrderDetail {
  summary: OrderValueSummary;
  /** = summary.orderBasedUnrecognizedValue, and also = the sum of
   * `rows[].order_total`. NOT "total minus recognized revenue": it is the
   * Completed+Paid complement inside the Orders population only. */
  total: number;
  count: number;
  rows: OrderValueDetailRow[];
}

function firstCustomer(c: OrderValueRow["customer"]): { full_name: string; customer_code: string } | null {
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

async function buildDetailRows(rows: OrderValueRow[], client: SupabaseClient): Promise<OrderValueDetailRow[]> {
  const orderIds = rows.map((r) => r.id).filter((id): id is string => !!id);
  const paymentRows = orderIds.length
    ? await selectIn<{ order_id: string; amount: number; payment_method: string }>(
        client,
        "payments",
        "order_id, amount, payment_method",
        "order_id",
        orderIds
      )
    : [];
  const paymentsByOrderId = new Map<string, { amount: number; payment_method: string }[]>();
  for (const p of paymentRows) {
    const list = paymentsByOrderId.get(p.order_id) ?? [];
    list.push({ amount: Number(p.amount) || 0, payment_method: p.payment_method });
    paymentsByOrderId.set(p.order_id, list);
  }

  const detail = rows.map((row): OrderValueDetailRow => {
    const total = Number(row.total_amount) || 0;
    const payments = (row.id && paymentsByOrderId.get(row.id)) || [];
    const paid = deriveOrderPaymentSummary(total, payments);
    const customer = firstCustomer(row.customer);
    return {
      order_id: row.id ?? "",
      order_number: row.order_number ?? "",
      order_date: row.order_date ?? "",
      customer_id: row.customer_id ?? "",
      customer_name: customer?.full_name ?? "",
      customer_code: customer?.customer_code ?? null,
      order_status: row.order_status,
      payment_status: row.payment_status,
      order_total: total,
      paid_amount: paid.amountPaid,
      remaining_amount: paid.remainingBalance,
      payment_count: payments.length,
      recognized: isOrderRecognized(row),
      sold: isSoldOrder(row, payments.length),
      unrecognized_reason: getUnrecognizedReason(row, payments.length),
    };
  });

  return detail.sort((a, b) => {
    if (a.order_date !== b.order_date) return a.order_date < b.order_date ? 1 : -1;
    return a.order_number < b.order_number ? 1 : a.order_number > b.order_number ? -1 : 0;
  });
}

/** Drill-down for "Tổng giá trị đơn hàng": every non-Lost order in range.
 * `total` reconciles exactly to getOrderValueSummary().totalOrderValue. */
export async function getOrderValueDetail(
  range: DateRange | null,
  staff?: ScopingStaff | null,
  client: SupabaseClient = supabase
): Promise<OrderValueDetail> {
  const orders = await loadOrderValueOrders(range, staff, client);
  if (!orders) return { summary: EMPTY_SUMMARY, total: 0, count: 0, rows: [] };
  const summary = summarizeOrderValueRows(orders);
  const rows = await buildDetailRows(orders, client);
  return { summary, total: summary.totalOrderValue, count: summary.totalOrderCount, rows };
}

/** Drill-down for "Giá trị đơn chưa ghi nhận": exactly the orders that are
 * not Completed + Paid. `total` reconciles exactly to
 * getOrderValueSummary().orderBasedUnrecognizedValue (same rows, same
 * check). Payment records are only fetched for these orders. */
export async function getUnrecognizedOrderDetail(
  range: DateRange | null,
  staff?: ScopingStaff | null,
  client: SupabaseClient = supabase
): Promise<UnrecognizedOrderDetail> {
  const orders = await loadOrderValueOrders(range, staff, client);
  if (!orders) return { summary: EMPTY_SUMMARY, total: 0, count: 0, rows: [] };
  const summary = summarizeOrderValueRows(orders);
  const rows = await buildDetailRows(
    orders.filter((o) => !isOrderRecognized(o)),
    client
  );
  return { summary, total: summary.orderBasedUnrecognizedValue, count: summary.unrecognizedOrderCount, rows };
}

// ---------------------------------------------------------------------------
// Phase 1.5A: PRODUCT view of the same two order populations.
//
// Built on the SAME order set (loadOrderValueOrders) and the SAME per-order detail (buildDetailRows - paid / remaining /
// recognition / reason), so the product view can never describe different orders or different payments than the order
// view. Nothing is written and nothing is invented:
//  - an order with product lines -> one row per line (amount = order_items.line_total);
//  - an order WITHOUT any product line -> ONE presentation row "Chưa có sản phẩm trong đơn" carrying the order total
//    (it is not a product; it is never stored);
//  - an order whose total differs from the sum of its lines (e.g. an order-level discount) -> ONE extra
//    "order_difference" row with the remainder, so that every order always contributes exactly its order total.
// Therefore: sum(rows.amount) === the canonical total of the selected metric, by construction, and re-checked below.
// ---------------------------------------------------------------------------

export type OrderProductRowKind = "line" | "no_items" | "order_difference";

export interface OrderProductDetailRow {
  /** Unique key: the order_items id for a line, otherwise "<kind>:<order id>". */
  row_key: string;
  kind: OrderProductRowKind;
  order_id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer_name: string;
  customer_code: string | null;
  order_status: string;
  payment_status: string;
  recognized: boolean;
  unrecognized_reason: UnrecognizedReason | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  category: string | null;
  quantity: number | null;
  unit_price: number | null;
  discount: number | null;
  /** What this row adds to the metric's total. Line: the line total. no_items: the order total. order_difference: the remainder. */
  amount: number;
  /** ORDER-level figures, repeated on every row of the same order - never to be summed across rows. */
  order_total: number;
  paid_amount: number;
  remaining_amount: number;
}

export interface OrderProductDetail {
  summary: OrderValueSummary;
  /** The canonical total of the selected metric (== the Overview card). */
  total: number;
  /** sum(rows[].amount), computed independently - equals `total` unless the data itself is inconsistent. */
  rowsTotal: number;
  count: number;
  orderCount: number;
  noItemsOrderCount: number;
  noItemsTotal: number;
  differenceTotal: number;
  rows: OrderProductDetailRow[];
}

interface ItemProductRelation {
  product_code: string | null;
  product_name: string | null;
  category: string | null;
}

export interface OrderItemLine {
  id: string;
  order_id: string;
  product_id: string | null;
  snapshot_sale_price: number | null;
  discount: number | null;
  quantity: number | null;
  line_total: number | null;
  product: ItemProductRelation | ItemProductRelation[] | null;
}

const ORDER_ITEM_COLUMNS =
  "id, order_id, product_id, snapshot_sale_price, discount, quantity, line_total, product:products(product_code, product_name, category)";

function lineAmount(item: OrderItemLine): number {
  if (item.line_total !== null && item.line_total !== undefined && Number.isFinite(Number(item.line_total))) return Number(item.line_total);
  return (Number(item.snapshot_sale_price) || 0) * (Number(item.quantity) || 1) - (Number(item.discount) || 0);
}

/** Pure. `orderRows` are the per-order details (already sorted newest first); `items` are their order_items. */
export function buildOrderProductRows(orderRows: OrderValueDetailRow[], items: OrderItemLine[]): OrderProductDetailRow[] {
  const byOrder = new Map<string, OrderItemLine[]>();
  for (const item of items) {
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }

  const rows: OrderProductDetailRow[] = [];
  for (const o of orderRows) {
    const base = {
      order_id: o.order_id,
      order_number: o.order_number,
      order_date: o.order_date,
      customer_id: o.customer_id,
      customer_name: o.customer_name,
      customer_code: o.customer_code,
      order_status: o.order_status,
      payment_status: o.payment_status,
      recognized: o.recognized,
      unrecognized_reason: o.unrecognized_reason,
      order_total: o.order_total,
      paid_amount: o.paid_amount,
      remaining_amount: o.remaining_amount,
    };
    const lines = (byOrder.get(o.order_id) ?? []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    if (lines.length === 0) {
      rows.push({ ...base, row_key: `no_items:${o.order_id}`, kind: "no_items", product_id: null, product_code: null, product_name: null, category: null, quantity: null, unit_price: null, discount: null, amount: o.order_total });
      continue;
    }

    let linesSum = 0;
    for (const item of lines) {
      const p = Array.isArray(item.product) ? item.product[0] ?? null : item.product;
      const amount = lineAmount(item);
      linesSum += amount;
      rows.push({
        ...base,
        row_key: item.id,
        kind: "line",
        product_id: item.product_id,
        product_code: p?.product_code ?? null,
        product_name: p?.product_name ?? null,
        category: p?.category ?? null,
        quantity: item.quantity === null || item.quantity === undefined ? null : Number(item.quantity),
        unit_price: item.snapshot_sale_price === null || item.snapshot_sale_price === undefined ? null : Number(item.snapshot_sale_price),
        discount: item.discount === null || item.discount === undefined ? null : Number(item.discount),
        amount,
      });
    }
    const remainder = o.order_total - linesSum;
    if (Math.abs(remainder) >= 0.005) {
      rows.push({ ...base, row_key: `order_difference:${o.order_id}`, kind: "order_difference", product_id: null, product_code: null, product_name: null, category: null, quantity: null, unit_price: null, discount: null, amount: remainder });
    }
  }
  return rows;
}

const EMPTY_PRODUCT_DETAIL = (summary: OrderValueSummary): OrderProductDetail => ({
  summary,
  total: 0,
  rowsTotal: 0,
  count: 0,
  orderCount: 0,
  noItemsOrderCount: 0,
  noItemsTotal: 0,
  differenceTotal: 0,
  rows: [],
});

async function loadOrderProductDetail(
  range: DateRange | null,
  staff: ScopingStaff | null | undefined,
  client: SupabaseClient,
  onlyUnrecognized: boolean
): Promise<OrderProductDetail> {
  const orders = await loadOrderValueOrders(range, staff, client);
  if (!orders) return EMPTY_PRODUCT_DETAIL(EMPTY_SUMMARY);
  const summary = summarizeOrderValueRows(orders);
  const population = onlyUnrecognized ? orders.filter((o) => !isOrderRecognized(o)) : orders;
  const orderRows = await buildDetailRows(population, client);
  const ids = orderRows.map((r) => r.order_id).filter((id) => id !== "");
  const items = ids.length ? await selectIn<OrderItemLine>(client, "order_items", ORDER_ITEM_COLUMNS, "order_id", ids) : [];
  const rows = buildOrderProductRows(orderRows, items);

  const noItems = rows.filter((r) => r.kind === "no_items");
  return {
    summary,
    total: onlyUnrecognized ? summary.orderBasedUnrecognizedValue : summary.totalOrderValue,
    rowsTotal: rows.reduce((sum, r) => sum + r.amount, 0),
    count: rows.length,
    orderCount: orderRows.length,
    noItemsOrderCount: noItems.length,
    noItemsTotal: noItems.reduce((sum, r) => sum + r.amount, 0),
    differenceTotal: rows.filter((r) => r.kind === "order_difference").reduce((sum, r) => sum + r.amount, 0),
    rows,
  };
}

/** Product view of "Tổng giá trị đơn hàng": every non-Lost order in range, by product line. */
export async function getOrderValueProductDetail(
  range: DateRange | null,
  staff?: ScopingStaff | null,
  client: SupabaseClient = supabase
): Promise<OrderProductDetail> {
  return loadOrderProductDetail(range, staff, client, false);
}

/** Product view of "Giá trị chưa ghi nhận": exactly the orders that are not Completed + Paid, by product line. */
export async function getUnrecognizedProductDetail(
  range: DateRange | null,
  staff?: ScopingStaff | null,
  client: SupabaseClient = supabase
): Promise<OrderProductDetail> {
  return loadOrderProductDetail(range, staff, client, true);
}
