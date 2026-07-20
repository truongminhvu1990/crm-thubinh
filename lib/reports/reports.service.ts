import { supabase } from "@/lib/supabase";
import { DateFilterOption, DateRange, getDateRange } from "@/lib/dateFilter";

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
  overdueBatches: OverdueBatchRow[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  assigned_salesperson: string | null;
}

export async function getCustomerReportData(): Promise<CustomerReportData> {
  const { data, error } = await supabase.from("customers").select("source, vip_level, assigned_salesperson");

  if (error || !data) {
    if (error) console.error("Error fetching customer report data:", error);
    return { total: 0, bySource: [], byVipTier: [], bySalesperson: [] };
  }

  const rows = data as CustomerRow[];
  return {
    total: rows.length,
    bySource: groupCount(rows, (r) => r.source),
    byVipTier: groupCount(rows, (r) => r.vip_level),
    bySalesperson: groupCount(rows, (r) => r.assigned_salesperson),
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
export async function getProductReportData(): Promise<ProductReportData> {
  const { data, error } = await supabase.from("products").select("status, category, origin, salesperson");

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
  customer_id: string;
  sale_price: number;
  sale_date: string;
  source: string | null;
  salesperson: string | null;
  customer: { full_name: string } | null;
}

/**
 * Revenue by Source/Salesperson/Top Customers/Period - all four are Date
 * Filter targets (REPORTS_SPEC.md §3.3/§4). Revenue by Period always
 * buckets by calendar month regardless of which filter option is active
 * (REPORTS_UI.md Decision 2) - the range narrows which rows are included,
 * the bucketing granularity does not change.
 */
export async function getPurchaseReportData(range: DateRange | null): Promise<PurchaseReportData> {
  let query = supabase
    .from("customer_purchases")
    .select("customer_id, sale_price, sale_date, source, salesperson, customer:customers(full_name)");
  if (range) {
    query = query.gte("sale_date", range.start).lt("sale_date", range.end);
  }
  const { data, error } = await query;

  const empty: PurchaseReportData = { totalRevenue: 0, bySource: [], bySalesperson: [], topCustomers: [], byPeriod: [] };
  if (error || !data) {
    if (error) console.error("Error fetching purchase report data:", error);
    return empty;
  }

  const rows = data as unknown as PurchaseRow[];

  const sourceMap = new Map<string, { count: number; revenue: number }>();
  const salespersonMap = new Map<string, { count: number; revenue: number }>();
  const customerMap = new Map<string, { name: string; count: number; revenue: number }>();
  const monthMap = new Map<string, number>();
  let totalRevenue = 0;

  for (const row of rows) {
    const price = Number(row.sale_price) || 0;
    totalRevenue += price;

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

  return {
    totalRevenue,
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
}

interface BatchPurchaseRow {
  sale_price: number;
  product: { batch_id: string | null } | null;
}

/**
 * Product/Sold/Remaining Count by Batch and Overdue Batches are current-state
 * counts - not Date Filter targets (REPORTS_SPEC.md §3.5/§4). Revenue by
 * Batch is the one exception, fetched separately by getRevenueByBatch below
 * so a Date Filter change here doesn't force a redundant refetch of this data.
 */
export async function getBatchStaticReportData(): Promise<BatchStaticReportData> {
  const [batchesRes, productsRes] = await Promise.all([
    supabase.from("product_batches").select("id, batch_code, status, return_due_date"),
    supabase.from("products").select("batch_id, status").not("batch_id", "is", null),
  ]);

  const empty: BatchStaticReportData = {
    totalBatches: 0,
    productCountByBatch: [],
    soldCountByBatch: [],
    remainingCountByBatch: [],
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
  for (const product of products) {
    if (!product.batch_id) continue;
    productCountMap.set(product.batch_id, (productCountMap.get(product.batch_id) || 0) + 1);
    // Sold vs. Remaining basis (REPORTS_SPEC.md §2): status === "Sold" -> Sold;
    // anything except "Sold"/"Returned" -> Remaining.
    if (product.status === "Sold") {
      soldCountMap.set(product.batch_id, (soldCountMap.get(product.batch_id) || 0) + 1);
    } else if (product.status !== "Returned") {
      remainingCountMap.set(product.batch_id, (remainingCountMap.get(product.batch_id) || 0) + 1);
    }
  }

  const todayStr = toDateStr(new Date());

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
    overdueBatches,
  };
}

/** Revenue by Batch - the one Batch report that is a Date Filter target. */
export async function getRevenueByBatch(range: DateRange | null): Promise<BatchRevenueRow[]> {
  let purchasesQuery = supabase.from("customer_purchases").select("sale_price, product:products!inner(batch_id)");
  if (range) {
    purchasesQuery = purchasesQuery.gte("sale_date", range.start).lt("sale_date", range.end);
  }

  const [batchesRes, purchasesRes] = await Promise.all([
    supabase.from("product_batches").select("id, batch_code"),
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
    if (!batchId) continue;
    revenueMap.set(batchId, (revenueMap.get(batchId) || 0) + (Number(row.sale_price) || 0));
  }

  return batches
    .map((b) => ({ batchId: b.id, batchCode: b.batch_code, revenue: revenueMap.get(b.id) || 0 }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}
