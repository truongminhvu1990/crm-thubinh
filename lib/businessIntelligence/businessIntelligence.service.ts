import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DateRange } from "@/lib/dateFilter";
import {
  ExecutiveSummary,
  SalesAnalytics,
  InventoryAnalytics,
  PartnerAnalytics,
  CustomerAnalytics,
  FinancialAnalytics,
  MonthlyPoint,
} from "@/types/businessIntelligence";

/** Business Intelligence Dashboard. Reconciled against the now-LOCKED
 * docs/18_BUSINESS_INTELLIGENCE_SPEC.md (Product Owner Implementation
 * Alignment Task, 2026-07-31) — every function here is read-only, queries
 * existing tables directly (never another module's service code, matching
 * docs/07_REPORTING_SPEC.md's own "Read Models/Views/BI Queries only" rule),
 * and never writes anything. Conversion Trend, Aging Inventory, Returning
 * Customers, Purchase Frequency, and Running Payout Trend are deliberately
 * NOT computed anywhere in this file — the spec moved them to Future
 * Enhancements, and this Alignment Task requires removing them, not just
 * leaving them uncalled.
 *
 * Revenue Recognition uses BR-001 (`docs/docs/BUSINESS_RULE_DECISIONS.md`):
 * Completed AND Paid. Computed from `orders` directly — NOT from the
 * legacy `customer_purchases` table the existing Reports BI Center
 * (app/api/reports/bi/*) reads. That system predates the Orders module and
 * was deliberately left untouched ("Do NOT redesign existing modules");
 * this dashboard is a new, separate Read Model over the current system of
 * record instead, so its numbers may not match the legacy BI Center's own
 * revenue figures — flagged in the delivery report, not silently glossed
 * over. */

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function applyRange<T extends { gte: (col: string, v: string) => T; lt: (col: string, v: string) => T }>(
  query: T,
  range: DateRange | null,
  column: string
): T {
  if (!range) return query;
  return query.gte(column, range.start).lt(column, range.end);
}

function sumBy<T>(rows: T[], selector: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + (selector(row) || 0), 0);
}

function toMonthlySeries(map: Map<string, number>): MonthlyPoint[] {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
}

interface OrderRow {
  id: string;
  order_status: string;
  payment_status: string;
  total_amount: number;
  order_date: string;
  customer_id: string;
  partner_id: string | null;
}

async function fetchOrders(range: DateRange | null, client: SupabaseClient): Promise<OrderRow[]> {
  let query = client.from("orders").select("id, order_status, payment_status, total_amount, order_date, customer_id, partner_id");
  query = applyRange(query, range, "order_date");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

function isRecognizedRevenue(order: OrderRow): boolean {
  return order.order_status === "Completed" && order.payment_status === "Paid";
}

/** Completed settlement totals, joined from settlement_items ->
 * compensations, since `settlements` deliberately has no stored total
 * column (docs/14_SETTLEMENT_SPEC.md §6 Revision 4 — always SUM(items),
 * never stored). Shared by Executive Summary, Partner Analytics, and
 * Financial Analytics so the join only happens once per request shape. */
async function fetchCompletedSettlementItems(
  range: DateRange | null,
  client: SupabaseClient
): Promise<{ settlement_id: string; partner_id: string | null; amount: number }[]> {
  let settlementsQuery = client.from("settlements").select("id, partner_id, completed_at").eq("status", "Completed");
  settlementsQuery = applyRange(settlementsQuery, range, "completed_at");
  const { data: settlements, error: settlementsError } = await settlementsQuery;
  if (settlementsError) throw settlementsError;
  if (!settlements || settlements.length === 0) return [];

  const settlementIds = settlements.map((s) => s.id);
  const partnerBySettlement = new Map(settlements.map((s) => [s.id, s.partner_id]));

  const { data: items, error: itemsError } = await client
    .from("settlement_items")
    .select("settlement_id, compensation:compensations(calculated_amount)")
    .in("settlement_id", settlementIds);
  if (itemsError) throw itemsError;

  return ((items ?? []) as unknown as { settlement_id: string; compensation: { calculated_amount: number } | null }[]).map(
    (item) => ({
      settlement_id: item.settlement_id,
      partner_id: partnerBySettlement.get(item.settlement_id) ?? null,
      amount: item.compensation?.calculated_amount ?? 0,
    })
  );
}

/** Every Settlement's own items, regardless of status — docs/
 * 18_BUSINESS_INTELLIGENCE_SPEC.md Decision 5 (Settlement by Partner):
 * `SUM(Settlement Amount) GROUP BY Partner`, with no Completed-only filter,
 * unlike fetchCompletedSettlementItems above (still used by Compensation
 * Paid and the Completed-only amount in Settlement Status, both unchanged
 * by this Alignment Task). Filtered by the Settlement's own `created_at`
 * (every Settlement has one; `completed_at` would exclude non-Completed
 * rows from the date filter entirely). */
async function fetchAllSettlementItems(
  range: DateRange | null,
  client: SupabaseClient
): Promise<{ settlement_id: string; partner_id: string | null; amount: number }[]> {
  let settlementsQuery = client.from("settlements").select("id, partner_id, created_at");
  settlementsQuery = applyRange(settlementsQuery, range, "created_at");
  const { data: settlements, error: settlementsError } = await settlementsQuery;
  if (settlementsError) throw settlementsError;
  if (!settlements || settlements.length === 0) return [];

  const settlementIds = settlements.map((s) => s.id);
  const partnerBySettlement = new Map(settlements.map((s) => [s.id, s.partner_id]));

  const { data: items, error: itemsError } = await client
    .from("settlement_items")
    .select("settlement_id, compensation:compensations(calculated_amount)")
    .in("settlement_id", settlementIds);
  if (itemsError) throw itemsError;

  return ((items ?? []) as unknown as { settlement_id: string; compensation: { calculated_amount: number } | null }[]).map(
    (item) => ({
      settlement_id: item.settlement_id,
      partner_id: partnerBySettlement.get(item.settlement_id) ?? null,
      amount: item.compensation?.calculated_amount ?? 0,
    })
  );
}

export async function getExecutiveSummary(range: DateRange | null, client: SupabaseClient = supabase): Promise<ExecutiveSummary> {
  const [orders, customersCountRes, sellableProducts, compensations, settlementsCountRes] = await Promise.all([
    fetchOrders(range, client),
    (() => {
      let q = client.from("customers").select("id", { count: "exact", head: true });
      q = applyRange(q, range, "created_at");
      return q;
    })(),
    // Inventory Value — Decision 1: SUM(Base Price) WHERE Product Status IN
    // (Available, Reserved). Product Status Standardization (2026-08-14)
    // made this a direct, literal query for the first time — live storage
    // now genuinely has a disjoint "Reserved" value (docs/02_PRODUCT_SPEC.md
    // §7, LOCKED four-value model), so this reads exactly what the spec
    // says rather than approximating it through the old model's single
    // "Active" value.
    client.from("products").select("sale_price").in("status", ["Available", "Reserved"]),
    // Total Compensation — Decision 2: SUM(Compensation Amount) WHERE
    // status != Cancelled.
    (() => {
      let q = client.from("compensations").select("calculated_amount").neq("status", "Cancelled");
      q = applyRange(q, range, "created_at");
      return q;
    })(),
    // Total Settlements — Decision 3: COUNT(Settlement), not a sum. No
    // status filter — every Settlement Request counts, regardless of
    // status.
    (() => {
      let q = client.from("settlements").select("id", { count: "exact", head: true });
      q = applyRange(q, range, "created_at");
      return q;
    })(),
  ]);

  if (sellableProducts.error) throw sellableProducts.error;
  if (compensations.error) throw compensations.error;

  return {
    totalRevenue: sumBy(orders.filter(isRecognizedRevenue), (o) => o.total_amount),
    totalOrders: orders.length,
    totalCustomers: customersCountRes.count ?? 0,
    inventoryValue: sumBy((sellableProducts.data ?? []) as { sale_price: number }[], (p) => p.sale_price),
    totalCompensation: sumBy((compensations.data ?? []) as { calculated_amount: number }[], (c) => c.calculated_amount),
    totalSettlements: settlementsCountRes.count ?? 0,
  };
}

export async function getSalesAnalytics(range: DateRange | null, client: SupabaseClient = supabase): Promise<SalesAnalytics> {
  const orders = await fetchOrders(range, client);

  const revenueMap = new Map<string, number>();
  const ordersMap = new Map<string, number>();

  for (const order of orders) {
    const month = monthKey(order.order_date);
    ordersMap.set(month, (ordersMap.get(month) ?? 0) + 1);
    if (isRecognizedRevenue(order)) {
      revenueMap.set(month, (revenueMap.get(month) ?? 0) + order.total_amount);
    }
  }

  // Conversion Trend is deliberately NOT computed here — moved to Future
  // Enhancements (docs/18_BUSINESS_INTELLIGENCE_SPEC.md §7); this CRM has
  // no lead/prospect/funnel concept to define "conversion" against.

  const recognized = orders.filter(isRecognizedRevenue);
  const totalRevenue = sumBy(recognized, (o) => o.total_amount);

  return {
    revenueByMonth: toMonthlySeries(revenueMap),
    ordersByMonth: toMonthlySeries(ordersMap),
    averageOrderValue: recognized.length > 0 ? totalRevenue / recognized.length : 0,
  };
}

/** Inventory is a live snapshot, not a historical range query — the date
 * filter is deliberately not applied here (a "Total Compensation between
 * two dates" question makes sense; "Inventory Value between two dates"
 * does not, since Product has no historical valuation record).
 *
 * Aging Inventory is deliberately NOT computed here — moved to Future
 * Enhancements (docs/18_BUSINESS_INTELLIGENCE_SPEC.md §7); no Product
 * Status transition timestamp exists, and no threshold was ever decided. */
export async function getInventoryAnalytics(client: SupabaseClient = supabase): Promise<InventoryAnalytics> {
  // Product Status Standardization (2026-08-14): Products Reserved used to
  // be derived via a separate order_items join, since products.status had
  // no disjoint "Reserved" value to query directly. Now it does
  // (docs/02_PRODUCT_SPEC.md §7, LOCKED) — this reads
  // docs/18_BUSINESS_INTELLIGENCE_SPEC.md's own already-LOCKED formula
  // literally for the first time ("COUNT(products) WHERE product_status =
  // 'Reserved'"), so the order_items join is no longer needed here.
  const { data, error } = await client.from("products").select("id, status, sale_price");
  if (error) throw error;

  const products = (data ?? []) as { id: string; status: string; sale_price: number }[];

  // Products Available — a distinct metric from Inventory Value: "Available
  // only" (docs/18_BUSINESS_INTELLIGENCE_SPEC.md, "COUNT(products) WHERE
  // product_status = 'Available'"), not "Available + Reserved". The two
  // metrics shared one filter under the old model only because there was
  // no way to tell them apart in storage; now there is.
  const availableProducts = products.filter((p) => p.status === "Available");
  const reservedProducts = products.filter((p) => p.status === "Reserved");

  return {
    // Inventory Value — Decision 1: SUM(Base Price) WHERE Product Status IN
    // (Available, Reserved) — the two sellable-but-not-yet-sold states.
    inventoryValue: sumBy([...availableProducts, ...reservedProducts], (p) => p.sale_price),
    productsAvailable: availableProducts.length,
    productsReserved: reservedProducts.length,
    productsSold: products.filter((p) => p.status === "Sold").length,
  };
}

export async function getPartnerAnalytics(range: DateRange | null, client: SupabaseClient = supabase): Promise<PartnerAnalytics> {
  const [orders, compensationsRes, settlementItems, partnersRes] = await Promise.all([
    fetchOrders(range, client),
    // Compensation by Partner — Decision 4: SUM(Compensation Amount)
    // GROUP BY Partner. Decision 4's own text doesn't restate the Cancelled
    // exclusion, but this applies Decision 2's exclusion here too, since
    // "Compensation Amount" is the same term Decision 2 already defines
    // (docs/18_BUSINESS_INTELLIGENCE_SPEC.md §6 Partner Analytics table).
    (() => {
      let q = client.from("compensations").select("partner_id, calculated_amount").neq("status", "Cancelled");
      q = applyRange(q, range, "created_at");
      return q;
    })(),
    // Settlement by Partner — Decision 5: SUM(Settlement Amount) GROUP BY
    // Partner, no status filter (unlike Compensation Paid in Financial
    // Analytics, which stays Completed-only).
    fetchAllSettlementItems(range, client),
    client.from("partners").select("id, name"),
  ]);
  if (compensationsRes.error) throw compensationsRes.error;
  if (partnersRes.error) throw partnersRes.error;

  const partnerNames = new Map(((partnersRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const revenueByPartner = new Map<string, number>();
  const ordersByPartner = new Map<string, number>();
  for (const order of orders) {
    if (!order.partner_id) continue;
    ordersByPartner.set(order.partner_id, (ordersByPartner.get(order.partner_id) ?? 0) + 1);
    if (isRecognizedRevenue(order)) {
      revenueByPartner.set(order.partner_id, (revenueByPartner.get(order.partner_id) ?? 0) + order.total_amount);
    }
  }

  const compensationByPartner = new Map<string, number>();
  for (const c of (compensationsRes.data ?? []) as { partner_id: string | null; calculated_amount: number }[]) {
    if (!c.partner_id) continue;
    compensationByPartner.set(c.partner_id, (compensationByPartner.get(c.partner_id) ?? 0) + c.calculated_amount);
  }

  const settlementByPartner = new Map<string, number>();
  for (const item of settlementItems) {
    if (!item.partner_id) continue;
    settlementByPartner.set(item.partner_id, (settlementByPartner.get(item.partner_id) ?? 0) + item.amount);
  }

  const partnerIds = new Set([
    ...revenueByPartner.keys(),
    ...ordersByPartner.keys(),
    ...compensationByPartner.keys(),
    ...settlementByPartner.keys(),
  ]);

  const rows = [...partnerIds]
    .map((partnerId) => ({
      partner_id: partnerId,
      partner_name: partnerNames.get(partnerId) ?? "—",
      revenue: revenueByPartner.get(partnerId) ?? 0,
      orders: ordersByPartner.get(partnerId) ?? 0,
      compensation: compensationByPartner.get(partnerId) ?? 0,
      settlement: settlementByPartner.get(partnerId) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return { rows };
}

export async function getCustomerAnalytics(range: DateRange | null, client: SupabaseClient = supabase): Promise<CustomerAnalytics> {
  const [orders, newCustomersRes, customersRes] = await Promise.all([
    fetchOrders(range, client),
    (() => {
      let q = client.from("customers").select("id", { count: "exact", head: true });
      q = applyRange(q, range, "created_at");
      return q;
    })(),
    client.from("customers").select("id, full_name, customer_code"),
  ]);
  if (newCustomersRes.error) throw newCustomersRes.error;
  if (customersRes.error) throw customersRes.error;

  const customerInfo = new Map(
    ((customersRes.data ?? []) as { id: string; full_name: string; customer_code: string }[]).map((c) => [c.id, c])
  );

  const recognized = orders.filter(isRecognizedRevenue);
  const revenueByCustomer = new Map<string, number>();
  const ordersByCustomer = new Map<string, number>();
  for (const order of recognized) {
    revenueByCustomer.set(order.customer_id, (revenueByCustomer.get(order.customer_id) ?? 0) + order.total_amount);
    ordersByCustomer.set(order.customer_id, (ordersByCustomer.get(order.customer_id) ?? 0) + 1);
  }

  // Returning Customers and Purchase Frequency are deliberately NOT
  // computed here — moved to Future Enhancements (docs/
  // 18_BUSINESS_INTELLIGENCE_SPEC.md §7); neither has a decided definition.

  const topCustomers = [...revenueByCustomer.entries()]
    .map(([customerId, revenue]) => ({
      customer_id: customerId,
      full_name: customerInfo.get(customerId)?.full_name ?? "—",
      customer_code: customerInfo.get(customerId)?.customer_code ?? "—",
      revenue,
      orders: ordersByCustomer.get(customerId) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    newCustomers: newCustomersRes.count ?? 0,
    topCustomers,
  };
}

export async function getFinancialAnalytics(range: DateRange | null, client: SupabaseClient = supabase): Promise<FinancialAnalytics> {
  const [settlementItems, allSettlementsRes, outstandingCompensationsRes, ledgerEntriesRes] = await Promise.all([
    // Compensation Paid — unchanged, still Completed-only (discharged via
    // a Completed Settlement, docs/18_BUSINESS_INTELLIGENCE_SPEC.md §6).
    fetchCompletedSettlementItems(range, client),
    (() => {
      let q = client.from("settlements").select("id, status, created_at");
      q = applyRange(q, range, "created_at");
      return q;
    })(),
    // Outstanding Compensation — Decision 6, amended (Finance Project #1,
    // Phase A Semantic Fix, Product Owner directive 2026-08-21): SUM
    // (Compensation Amount) WHERE status NOT IN ('Handed Off', 'Paid').
    // Original Decision 6 only excluded Handed Off, because no Paid status
    // existed on Compensation until Phase A introduced it
    // (mark_settlement_paid(), 2026082101_settlement_paid_module.sql) — a
    // Paid Compensation is money that has actually moved, never
    // "outstanding" under any reading of the term, so it's excluded here
    // alongside Handed Off. Read literally, this still includes Draft,
    // Pending, Confirmed, AND Cancelled amounts — Decision 6's own text
    // excludes only what's no longer pending payout, not Cancelled (unlike
    // Decision 2's Total Compensation). No unstated Cancelled exclusion is
    // added here, since Decision 6 is a complete, self-contained formula.
    // This is a read-model query change only — the Compensation state
    // machine, Settlement Paid implementation, and underlying schema are
    // all untouched.
    (() => {
      let q = client.from("compensations").select("calculated_amount").not("status", "in", '("Handed Off","Paid")');
      q = applyRange(q, range, "created_at");
      return q;
    })(),
    (() => {
      let q = client.from("compensation_ledger_entries").select("entry_amount");
      q = applyRange(q, range, "created_at");
      return q;
    })(),
  ]);
  if (allSettlementsRes.error) throw allSettlementsRes.error;
  if (outstandingCompensationsRes.error) throw outstandingCompensationsRes.error;
  if (ledgerEntriesRes.error) throw ledgerEntriesRes.error;

  const compensationPaid = sumBy(settlementItems, (i) => i.amount);

  const outstandingCompensation = sumBy(
    (outstandingCompensationsRes.data ?? []) as { calculated_amount: number }[],
    (c) => c.calculated_amount
  );

  const settlementsByStatus = new Map<string, { count: number; ids: string[] }>();
  for (const s of (allSettlementsRes.data ?? []) as { id: string; status: string }[]) {
    const bucket = settlementsByStatus.get(s.status) ?? { count: 0, ids: [] };
    bucket.count += 1;
    bucket.ids.push(s.id);
    settlementsByStatus.set(s.status, bucket);
  }
  const amountBySettlementId = new Map<string, number>();
  for (const item of settlementItems) {
    amountBySettlementId.set(item.settlement_id, (amountBySettlementId.get(item.settlement_id) ?? 0) + item.amount);
  }
  const settlementStatus = [...settlementsByStatus.entries()].map(([status, bucket]) => ({
    status,
    count: bucket.count,
    amount: status === "Completed" ? sumBy(bucket.ids, (id) => amountBySettlementId.get(id) ?? 0) : 0,
  }));

  const ledgerRows = (ledgerEntriesRes.data ?? []) as { entry_amount: number }[];

  // Running Payout Trend is deliberately NOT computed here — moved to
  // Future Enhancements (docs/18_BUSINESS_INTELLIGENCE_SPEC.md §7); it
  // would conflate with Compensation Ledger's own per-Recipient Balance
  // concept (§7 of that spec), a different thing this dashboard doesn't
  // (yet) have a LOCKED formula for.

  return {
    compensationPaid,
    outstandingCompensation,
    settlementStatus,
    ledgerEntryCount: ledgerRows.length,
    ledgerEntryTotal: sumBy(ledgerRows, (r) => r.entry_amount),
  };
}
