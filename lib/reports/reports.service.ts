import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DateFilterOption, DateRange, getDateRange } from "@/lib/dateFilter";
import { Staff } from "@/types/staff";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScopeWithFallback } from "@/lib/permission/dataScope";
import { BusinessTime } from "@/lib/businessTime";
import { isPurchaseRecognized, purchaseRecognitionRule, RECOGNITION_RULE_LABEL, RecognitionRule } from "@/lib/reports/revenueDefinition";
import { fetchAllRows, selectIn } from "@/lib/reports/selectIn";

// This module intentionally reads Supabase tables directly rather than
// importing customer.service.ts / product.service.ts / purchase.service.ts /
// report.service.ts / batchReport.service.ts / inventory.service.ts - Reports
// has no shared business logic with any other module (REPORTS_SPEC.md
// Decision 5, LOCKED). The Date Filter option set/range math is neutral,
// shared infrastructure (lib/dateFilter.ts, Sprint v1.0.2 - Global Date
// Filter) re-exported here so every existing import of DateFilterOption/
// DateRange/getDateRange from this module keeps working unchanged.
export type { DateFilterOption, DateRange };
export { getDateRange };

const UNSPECIFIED = "Chưa xác định";

export interface CountBreakdown {
  label: string;
  count: number;
}

export interface CustomerReportData {
  total: number;
  bySource: CountBreakdown[];
  byVipTier: CountBreakdown[];
  bySalesperson: CountBreakdown[];
}

export interface ProductReportData {
  total: number;
  byStatus: CountBreakdown[];
  byCategory: CountBreakdown[];
  byOrigin: CountBreakdown[];
  bySalesOwner: CountBreakdown[];
}

export interface SourceRevenueRow {
  source: string;
  count: number;
  revenue: number;
}

export interface SalespersonRevenueRow {
  salesperson: string;
  count: number;
  revenue: number;
}

export interface TopCustomerRow {
  customerId: string;
  name: string;
  count: number;
  revenue: number;
}

export interface MonthlyRevenueRow {
  month: string;
  revenue: number;
}

export interface PurchaseReportData {
  totalRevenue: number;
  /** Revenue & Sales Reporting Unification - the part of `totalRevenue`
   * that comes from BR-002 legacy customer_purchases rows with NO linked
   * Order (recognized by exception). The Dashboard's order-based
   * Total/Recognized/Unrecognized split (getOrderValueSummary) cannot see
   * these, so they are surfaced separately rather than silently dropped -
   * historical recognition is never changed to make a report tidier. */
  legacyRecognizedRevenue: number;
  /** Simple Profit Calculation Package, Part 3 - Σ cost_price of each sold
   * item's product, looked up from the products table (existing values
   * only, no new column, nothing persisted). 0 for rows whose product no
   * longer has a cost_price on file - never guessed. */
  totalCost: number;
  /** = totalRevenue - totalCost. The one and only formula this package
   * defines (no margin/percentage/ROI). */
  totalProfit: number;
  bySource: SourceRevenueRow[];
  bySalesperson: SalespersonRevenueRow[];
  topCustomers: TopCustomerRow[];
  byPeriod: MonthlyRevenueRow[];
}

export interface BatchRevenueRow {
  batchId: string;
  batchCode: string;
  revenue: number;
}

export interface BatchCountRow {
  batchId: string;
  batchCode: string;
  count: number;
}

export interface OverdueBatchRow {
  batchId: string;
  batchCode: string;
  dueDate: string;
  daysOverdue: number;
  remaining: number;
}

export interface BatchStaticReportData {
  totalBatches: number;
  productCountByBatch: BatchCountRow[];
  soldCountByBatch: BatchCountRow[];
  remainingCountByBatch: BatchCountRow[];
  /** Lot Product-Level Status, D9 (LOCKED): a sub-count of remainingCountByBatch
   * (Reserved products are already included there) - not a sibling total,
   * exists only to break Reserved out for display without a second source
   * of truth. */
  reservedCountByBatch: BatchCountRow[];
  overdueBatches: OverdueBatchRow[];
}

function groupCount<T>(rows: T[], key: (row: T) => string | null | undefined): CountBreakdown[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = key(row) || UNSPECIFIED;
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

interface CustomerRow {
  source: string | null;
  vip_level: string | null;
  assigned_staff: { full_name: string } | { full_name: string }[] | null;
}

function staffName(assigned_staff: CustomerRow["assigned_staff"]): string | null {
  if (!assigned_staff) return null;
  return Array.isArray(assigned_staff) ? assigned_staff[0]?.full_name ?? null : assigned_staff.full_name;
}

/** `client` defaults to the browser Supabase client so every existing
 * caller keeps its exact current behavior unchanged. Backend API Foundation
 * (Package 4C, Wave 4) passes a server client instead, from
 * app/api/reports/**.
 *
 * Legacy Field Migration (docs/01_CUSTOMER_SPEC.md §12, Product Owner
 * Implementation Gate, 2026-08-15) - "by Salesperson" now groups by the
 * structured `assigned_staff_id` (joined to `staff.full_name`), not the
 * deprecated `assigned_salesperson` free-text field, which is no longer
 * written on new/edited Customer records. */
export async function getCustomerReportData(client: SupabaseClient = supabase): Promise<CustomerReportData> {
  const { data, error } = await client.from("customers").select("source, vip_level, assigned_staff:staff(full_name)");

  if (error || !data) {
    if (error) console.error("Error fetching customer report data:", error);
    return { total: 0, bySource: [], byVipTier: [], bySalesperson: [] };
  }

  const rows = data as unknown as CustomerRow[];
  return {
    total: rows.length,
    bySource: groupCount(rows, (r) => r.source),
    byVipTier: groupCount(rows, (r) => r.vip_level),
    bySalesperson: groupCount(rows, (r) => staffName(r.assigned_staff)),
  };
}

interface ProductRow {
  status: string | null;
  category: string | null;
  origin: string | null;
  salesperson: string | null;
}

/**
 * Never selects products.available/reserved/sold - status is the only
 * stock signal (REPORTS_SPEC.md §2, carried from the resolved Inventory
 * counter-trust finding).
 */
export async function getProductReportData(client: SupabaseClient = supabase): Promise<ProductReportData> {
  const { data, error } = await client.from("products").select("status, category, origin, salesperson");

  if (error || !data) {
    if (error) console.error("Error fetching product report data:", error);
    return { total: 0, byStatus: [], byCategory: [], byOrigin: [], bySalesOwner: [] };
  }

  const rows = data as ProductRow[];
  return {
    total: rows.length,
    byStatus: groupCount(rows, (r) => r.status),
    byCategory: groupCount(rows, (r) => r.category),
    byOrigin: groupCount(rows, (r) => r.origin),
    bySalesOwner: groupCount(rows, (r) => r.salesperson),
  };
}

interface PurchaseRow {
  /** Phase 1 - Reporting Foundation: the optional identifying fields below
   * are selected ONLY so the recognized-revenue drill-down can explain each
   * row; they never enter any calculation. */
  id?: string;
  customer_id: string;
  product_id: string | null;
  sale_price: number;
  sale_date: string;
  source: string | null;
  salesperson: string | null;
  customer: { full_name: string; customer_code?: string } | null;
  product?: { product_code: string | null; product_name: string | null } | null;
  order_item_id: string | null;
  order_items: {
    id?: string;
    order_id?: string;
    orders: { order_number?: string; order_status: string; payment_status: string } | null;
  } | null;
}

/** BR-001 / BR-002 Revenue Recognition (both LOCKED) - Phase 1 Reporting
 * Foundation: the private copy of this rule that used to live here is now
 * `isPurchaseRecognized` in lib/reports/revenueDefinition.ts, the single
 * canonical implementation (verbatim rule, proven equal by
 * revenueDefinition.regression.test.ts). Semantics are unchanged: a row with
 * no linked Order (order_item_id NULL - legacy/manual, BR-002) is recognized;
 * a linked row is recognized only when its Order is Completed AND Paid
 * (BR-001). revenueDefinition.ts is itself part of lib/reports, so this
 * module still shares nothing with lib/orders (REPORTS_SPEC.md Decision 5). */
const isRevenueRecognized = isPurchaseRecognized;

/**
 * Revenue by Source/Salesperson/Top Customers/Period - all four are Date
 * Filter targets (REPORTS_SPEC.md §3.3/§4). Revenue by Period always
 * buckets by calendar month regardless of which filter option is active
 * (REPORTS_UI.md Decision 2) - the range narrows which rows are included,
 * the bucketing granularity does not change.
 */
/** Data Scope Rollout (Sprint v4.1), Package 5 - Dashboard's revenue widget
 * reads Customer Purchases (not Orders, per this module's own header
 * comment: "no Orders dependency for Dashboard revenue"), so it inherits
 * Customer Purchases' resolved scope (DATA_SCOPE_ROLLOUT_UI.md §6), the
 * same resolution Package 3/4 already apply - never a separately-invented
 * Dashboard-only rule.
 *
 * `staff` (Hotfix 4A - same sentinel pattern as Hotfix 3A's fix for
 * salesLedger.repository.ts's applyFilters): `undefined` (every pre-Hotfix-
 * 4A caller) means "resolve it yourself via getCurrentStaff(), exactly as
 * before" (Browser Authentication Context, correct for callers that
 * actually run in the browser). An explicit `Staff | null` means "use this
 * value, I already resolved it" - what app/api/reports/purchases/route.ts
 * now passes, using getCurrentStaffFromRequest() (Server Authentication
 * Context, lib/permission/serverAuth.ts) instead. Nothing about the Data
 * Scope call itself (applyDataScopeWithFallback, "revenue" resource,
 * salesperson_id/salesperson fields) changed - only how "current staff" is
 * identified. */
export async function getPurchaseReportData(
  range: DateRange | null,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<PurchaseReportData> {
  const { data, error } = await fetchPurchaseRows(range, client, staff);

  const empty: PurchaseReportData = {
    totalRevenue: 0,
    legacyRecognizedRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    bySource: [],
    bySalesperson: [],
    topCustomers: [],
    byPeriod: [],
  };
  if (error || !data) {
    if (error) console.error("Error fetching purchase report data:", error);
    return empty;
  }

  const rows = data as unknown as PurchaseRow[];

  // Simple Profit Calculation Package, Part 3 - Total Cost needs each sold
  // row's product cost_price, which customer_purchases doesn't itself store
  // (only product_id). One extra query against the existing `products`
  // table (Reports reads Supabase tables directly by design - see this
  // file's header comment - so this isn't a new cross-module dependency),
  // scoped to just the id/cost_price columns actually needed.
  const productIds = Array.from(new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id)));
  const costByProductId = new Map<string, number>();
  if (productIds.length > 0) {
    // Phase 1.2: chunked AND paged (was one unbounded .in() over every
    // distinct product id, which both overruns the URL and can exceed max-rows).
    const productRows = await selectIn<{ id: string; cost_price: number | null }>(client, "products", "id, cost_price", "id", productIds);
    for (const p of productRows) {
      if (typeof p.cost_price === "number") costByProductId.set(p.id, p.cost_price);
    }
  }

  const sourceMap = new Map<string, { count: number; revenue: number }>();
  const salespersonMap = new Map<string, { count: number; revenue: number }>();
  const customerMap = new Map<string, { name: string; count: number; revenue: number }>();
  const monthMap = new Map<string, number>();
  let totalCost = 0;

  for (const row of rows) {
    // BR-001: transaction counts (below) include every row regardless of
    // recognition status; only money (revenue/cost/profit) is gated.
    const recognized = isRevenueRecognized(row);
    const price = recognized ? Number(row.sale_price) || 0 : 0;
    if (recognized && row.product_id) totalCost += costByProductId.get(row.product_id) ?? 0;

    const sourceKey = row.source || UNSPECIFIED;
    const source = sourceMap.get(sourceKey) || { count: 0, revenue: 0 };
    source.count += 1;
    source.revenue += price;
    sourceMap.set(sourceKey, source);

    const spKey = row.salesperson || UNSPECIFIED;
    const sp = salespersonMap.get(spKey) || { count: 0, revenue: 0 };
    sp.count += 1;
    sp.revenue += price;
    salespersonMap.set(spKey, sp);

    const cust = customerMap.get(row.customer_id) || {
      name: row.customer?.full_name || "—",
      count: 0,
      revenue: 0,
    };
    cust.count += 1;
    cust.revenue += price;
    customerMap.set(row.customer_id, cust);

    const month = row.sale_date ? row.sale_date.slice(0, 7) : UNSPECIFIED;
    monthMap.set(month, (monthMap.get(month) || 0) + price);
  }

  // Phase 1 - Reporting Foundation: Recognized Revenue is summed by the SAME
  // function the recognized-revenue drill-down uses, so the Dashboard figure
  // and the detail total cannot drift apart.
  const { total: totalRevenue, legacyTotal: legacyRecognizedRevenue } = summarizeRecognizedPurchases(rows);

  return {
    totalRevenue,
    legacyRecognizedRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    bySource: Array.from(sourceMap, ([source, v]) => ({ source, ...v })).sort((a, b) => b.revenue - a.revenue),
    bySalesperson: Array.from(salespersonMap, ([salesperson, v]) => ({ salesperson, ...v })).sort(
      (a, b) => b.revenue - a.revenue
    ),
    topCustomers: Array.from(customerMap, ([customerId, v]) => ({ customerId, ...v })).sort(
      (a, b) => b.revenue - a.revenue
    ),
    byPeriod: Array.from(monthMap, ([month, revenue]) => ({ month, revenue })).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

interface BatchRow {
  id: string;
  batch_code: string;
  status: string | null;
  return_due_date: string | null;
}

interface ProductBatchLinkRow {
  batch_id: string | null;
  status: string | null;
  /** BR-003 (LOCKED, 2026-08-21) - the sole source of truth for whether a
   * product was returned to supplier; the retired "Returned" status value
   * is never checked (see the Remaining/Returned split below). */
  returned_at: string | null;
}

/** Phase 1 - Reporting Foundation. The ONE query behind Recognized Revenue:
 * every customer_purchases row in the `sale_date` range (linked AND legacy),
 * Data-Scoped by the "revenue" resource, with its linked Order embedded.
 * getPurchaseReportData (the Dashboard figure) and
 * getRecognizedRevenueDetail (its drill-down) BOTH read through this, so the
 * two can never describe different populations. The extra embedded columns
 * (id, order number, product, customer code) exist only for the drill-down;
 * every one of those embeds is already used by the Monthly Sold Products
 * repository against this same table. `staff` keeps the existing sentinel:
 * `undefined` = resolve the signed-in staff yourself, explicit
 * `Staff | null` = use it.
 *
 * Phase 1.2: read through fetchAllRows (paged, ordered by the unique `id`), so a
 * range holding more purchase rows than PostgREST's max-rows cap (default
 * 1000) is still read COMPLETELY. Same filters, same "revenue" data scope,
 * same `sale_date` basis. */
export const PURCHASE_ROW_SELECT =
  "id, customer_id, product_id, sale_price, sale_date, source, salesperson, order_item_id, order_items(id, order_id, orders(order_number, order_status, payment_status)), customer:customers(full_name, customer_code), product:products(product_code, product_name)";

export async function fetchPurchaseRows(
  range: DateRange | null,
  client: SupabaseClient = supabase,
  staff?: Staff | null
) {
  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;

  return await fetchAllRows<PurchaseRow>(client, "customer_purchases", PURCHASE_ROW_SELECT, async (base) => {
    let query = base;
    if (range) {
      query = query.gte("sale_date", range.start).lt("sale_date", range.end);
    }
    if (resolvedStaff) {
      query = (await applyDataScopeWithFallback(query, resolvedStaff, "revenue", "salesperson_id", "salesperson", client)).query;
    }
    return { query };
  });
}

export interface RecognizedPurchasesSummary {
  /** Sum of sale_price over every recognized row (BR-001 + BR-002) = the
   * Dashboard's "Doanh thu đã ghi nhận". */
  total: number;
  /** The BR-002 part (legacy rows with no linked Order) of `total`. */
  legacyTotal: number;
  /** The BR-001 part of `total` (rows linked to a Completed + Paid Order). */
  linkedTotal: number;
  count: number;
}

/** Sum over recognized rows, in row order. The only place Recognized Revenue
 * is added up - used by getPurchaseReportData and the drill-down alike. */
export function summarizeRecognizedPurchases(
  rows: { sale_price: number; order_item_id: string | null; order_items: PurchaseRow["order_items"] }[]
): RecognizedPurchasesSummary {
  let total = 0;
  let legacyTotal = 0;
  let count = 0;
  for (const row of rows) {
    if (!isRevenueRecognized(row)) continue;
    const amount = Number(row.sale_price) || 0;
    total += amount;
    if (!row.order_item_id) legacyTotal += amount;
    count += 1;
  }
  return { total, legacyTotal, linkedTotal: total - legacyTotal, count };
}

export interface RecognizedRevenueRow {
  purchase_id: string | null;
  /** The Dashboard's date basis for this metric: customer_purchases.sale_date. */
  recognition_date: string;
  amount: number;
  order_id: string | null;
  order_number: string | null;
  order_item_id: string | null;
  order_status: string | null;
  payment_status: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  customer_id: string;
  customer_name: string;
  customer_code: string | null;
  salesperson: string | null;
  rule: RecognitionRule;
  rule_label: string;
}

export interface RecognizedRevenueDetail extends RecognizedPurchasesSummary {
  rows: RecognizedRevenueRow[];
}

const EMPTY_RECOGNIZED_DETAIL: RecognizedRevenueDetail = { total: 0, legacyTotal: 0, linkedTotal: 0, count: 0, rows: [] };

/** Drill-down for "Doanh thu đã ghi nhận": one row per recognized
 * customer_purchases row, newest first. `total` is computed by
 * summarizeRecognizedPurchases over the SAME rows fetchPurchaseRows returns
 * to the Dashboard, so it reconciles exactly (BR-001 + BR-002 included;
 * neither rule is changed). */
export async function getRecognizedRevenueDetail(
  range: DateRange | null,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<RecognizedRevenueDetail> {
  const { data, error } = await fetchPurchaseRows(range, client, staff);
  if (error || !data) {
    if (error) console.error("Error fetching recognized revenue detail:", error);
    return EMPTY_RECOGNIZED_DETAIL;
  }

  const purchaseRows = data as unknown as PurchaseRow[];
  const summary = summarizeRecognizedPurchases(purchaseRows);

  const rows: RecognizedRevenueRow[] = [];
  for (const row of purchaseRows) {
    const rule = purchaseRecognitionRule(row);
    if (!rule) continue;
    const order = row.order_items?.orders ?? null;
    rows.push({
      purchase_id: row.id ?? null,
      recognition_date: row.sale_date,
      amount: Number(row.sale_price) || 0,
      order_id: row.order_items?.order_id ?? null,
      order_number: order?.order_number ?? null,
      order_item_id: row.order_item_id,
      order_status: order?.order_status ?? null,
      payment_status: order?.payment_status ?? null,
      product_id: row.product_id,
      product_code: row.product?.product_code ?? null,
      product_name: row.product?.product_name ?? null,
      customer_id: row.customer_id,
      customer_name: row.customer?.full_name ?? "",
      customer_code: row.customer?.customer_code ?? null,
      salesperson: row.salesperson,
      rule,
      rule_label: RECOGNITION_RULE_LABEL[rule],
    });
  }
  rows.sort((a, b) => (a.recognition_date === b.recognition_date ? 0 : a.recognition_date < b.recognition_date ? 1 : -1));

  return { ...summary, rows };
}

interface BatchPurchaseRow {
  sale_price: number;
  product: { batch_id: string | null } | null;
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
}

/**
 * Product/Sold/Remaining Count by Batch and Overdue Batches are current-state
 * counts - not Date Filter targets (REPORTS_SPEC.md §3.5/§4). Revenue by
 * Batch is the one exception, fetched separately by getRevenueByBatch below
 * so a Date Filter change here doesn't force a redundant refetch of this data.
 */
export async function getBatchStaticReportData(client: SupabaseClient = supabase): Promise<BatchStaticReportData> {
  const [batchesRes, productsRes] = await Promise.all([
    client.from("product_batches").select("id, batch_code, status, return_due_date"),
    client.from("products").select("batch_id, status, returned_at").not("batch_id", "is", null),
  ]);

  const empty: BatchStaticReportData = {
    totalBatches: 0,
    productCountByBatch: [],
    soldCountByBatch: [],
    remainingCountByBatch: [],
    reservedCountByBatch: [],
    overdueBatches: [],
  };
  if (batchesRes.error || !batchesRes.data) {
    if (batchesRes.error) console.error("Error fetching batches for report:", batchesRes.error);
    return empty;
  }
  if (productsRes.error) console.error("Error fetching batch products for report:", productsRes.error);

  const batches = batchesRes.data as BatchRow[];
  const products = (productsRes.data || []) as ProductBatchLinkRow[];

  const productCountMap = new Map<string, number>();
  const soldCountMap = new Map<string, number>();
  const remainingCountMap = new Map<string, number>();
  const reservedCountMap = new Map<string, number>();
  for (const product of products) {
    if (!product.batch_id) continue;
    productCountMap.set(product.batch_id, (productCountMap.get(product.batch_id) || 0) + 1);
    // Sold vs. Remaining basis (REPORTS_SPEC.md §2): status === "Sold" -> Sold;
    // anything else, EXCEPT a product returned to supplier, -> Remaining.
    // Reserved (D6, LOCKED) is a sub-count of Remaining, not tallied
    // separately here. BR-003 (LOCKED, 2026-08-21): "Returned" is retired
    // as a status value - a returned-to-supplier product now reads
    // status = "Archived", same as computeBatchCounts() (productBatch.
    // service.ts), so "returned" is read from returned_at IS NOT NULL,
    // never inferred from status alone. An Archived product with
    // returned_at NULL (archived for any other reason) is NOT excluded
    // here - it still counts as Remaining, matching computeBatchCounts()'s
    // own invariant exactly.
    if (product.status === "Sold") {
      soldCountMap.set(product.batch_id, (soldCountMap.get(product.batch_id) || 0) + 1);
    } else if (!product.returned_at) {
      remainingCountMap.set(product.batch_id, (remainingCountMap.get(product.batch_id) || 0) + 1);
      if (product.status === "Reserved") {
        reservedCountMap.set(product.batch_id, (reservedCountMap.get(product.batch_id) || 0) + 1);
      }
    }
  }

  // Business Time Migration, Wave 2: "today" for Overdue Batch determination
  // is a Business Date (Locked Product Owner decision) - this function runs
  // server-side (app/api/reports/batches/route.ts), where new Date() was
  // confirmed UTC, not Vietnam time.
  const todayStr = BusinessTime.todayString();

  const toCountRows = (map: Map<string, number>): BatchCountRow[] =>
    batches
      .map((b) => ({ batchId: b.id, batchCode: b.batch_code, count: map.get(b.id) || 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

  // Overdue Batch definition (REPORTS_SPEC.md §2): status === "active" AND
  // return_due_date is in the past.
  const overdueBatches = batches
    .filter((b) => b.status === "active" && b.return_due_date && b.return_due_date < todayStr)
    .map((b) => ({
      batchId: b.id,
      batchCode: b.batch_code,
      dueDate: b.return_due_date as string,
      daysOverdue: Math.floor(
        (new Date(todayStr).getTime() - new Date(b.return_due_date as string).getTime()) / 86_400_000
      ),
      remaining: remainingCountMap.get(b.id) || 0,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    totalBatches: batches.length,
    productCountByBatch: toCountRows(productCountMap),
    soldCountByBatch: toCountRows(soldCountMap),
    remainingCountByBatch: toCountRows(remainingCountMap),
    reservedCountByBatch: toCountRows(reservedCountMap),
    overdueBatches,
  };
}

/** Revenue by Batch - the one Batch report that is a Date Filter target. */
export async function getRevenueByBatch(
  range: DateRange | null,
  client: SupabaseClient = supabase
): Promise<BatchRevenueRow[]> {
  let purchasesQuery = client
    .from("customer_purchases")
    .select("sale_price, order_item_id, order_items(orders(order_status, payment_status)), product:products!inner(batch_id)");
  if (range) {
    purchasesQuery = purchasesQuery.gte("sale_date", range.start).lt("sale_date", range.end);
  }

  const [batchesRes, purchasesRes] = await Promise.all([
    client.from("product_batches").select("id, batch_code"),
    purchasesQuery,
  ]);

  if (batchesRes.error || !batchesRes.data) {
    if (batchesRes.error) console.error("Error fetching batches for revenue report:", batchesRes.error);
    return [];
  }
  if (purchasesRes.error) console.error("Error fetching batch revenue purchases:", purchasesRes.error);

  const batches = batchesRes.data as Pick<BatchRow, "id" | "batch_code">[];
  const purchases = (purchasesRes.data || []) as unknown as BatchPurchaseRow[];

  const revenueMap = new Map<string, number>();
  for (const row of purchases) {
    const batchId = row.product?.batch_id;
    if (!batchId || !isRevenueRecognized(row)) continue;
    revenueMap.set(batchId, (revenueMap.get(batchId) || 0) + (Number(row.sale_price) || 0));
  }

  return batches
    .map((b) => ({ batchId: b.id, batchCode: b.batch_code, revenue: revenueMap.get(b.id) || 0 }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}
