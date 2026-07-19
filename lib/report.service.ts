import { supabase } from "./supabase";

interface PurchaseReportRow {
  customer_id: string;
  sale_price: number;
  sale_date: string;
  source: string | null;
  salesperson: string | null;
  customer: { full_name: string } | null;
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

export interface ReportData {
  bySource: SourceRevenueRow[];
  bySalesperson: SalespersonRevenueRow[];
  topCustomers: TopCustomerRow[];
  monthly: MonthlyRevenueRow[];
}

const UNSPECIFIED = "Chưa xác định";
const EMPTY_REPORT: ReportData = { bySource: [], bySalesperson: [], topCustomers: [], monthly: [] };

/**
 * Every table on the Reports page is derived client-side from this one
 * customer_purchases fetch - source/salesperson/sale_price are the sale-time
 * snapshot (see purchase.service.ts), so these aggregates don't shift if a
 * product's current source/salesperson is edited later.
 */
export async function getReportData(): Promise<ReportData> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select("customer_id, sale_price, sale_date, source, salesperson, customer:customers(full_name)");

  if (error || !data) {
    if (error) console.error("Error fetching report data:", error);
    return EMPTY_REPORT;
  }

  const rows = data as unknown as PurchaseReportRow[];

  const sourceMap = new Map<string, { count: number; revenue: number }>();
  const salespersonMap = new Map<string, { count: number; revenue: number }>();
  const customerMap = new Map<string, { name: string; count: number; revenue: number }>();
  const monthMap = new Map<string, number>();

  for (const row of rows) {
    const price = Number(row.sale_price) || 0;

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

  const bySource = Array.from(sourceMap, ([source, v]) => ({ source, ...v })).sort(
    (a, b) => b.revenue - a.revenue
  );
  const bySalesperson = Array.from(salespersonMap, ([salesperson, v]) => ({ salesperson, ...v })).sort(
    (a, b) => b.revenue - a.revenue
  );
  const topCustomers = Array.from(customerMap, ([customerId, v]) => ({ customerId, ...v })).sort(
    (a, b) => b.revenue - a.revenue
  );
  const monthly = Array.from(monthMap, ([month, revenue]) => ({ month, revenue })).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  return { bySource, bySalesperson, topCustomers, monthly };
}

/**
 * Revenue for the calendar month containing `now` (defaults to the actual
 * current time) - computed from real dates each call, so it always tracks
 * whatever month it currently is with no hardcoded/stored month value.
 */
export async function getCurrentMonthRevenue(now: Date = new Date()): Promise<number> {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month + 1)}-01`;
  const nextMonth = new Date(year, month + 1, 1);
  const end = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01`;

  const { data, error } = await supabase
    .from("customer_purchases")
    .select("sale_price")
    .gte("sale_date", start)
    .lt("sale_date", end);

  if (error || !data) {
    if (error) console.error("Error fetching current month revenue:", error);
    return 0;
  }

  return data.reduce((sum, row) => sum + (Number(row.sale_price) || 0), 0);
}
