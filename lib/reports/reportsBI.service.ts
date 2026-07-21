import { supabase } from "@/lib/supabase";
import { DateRange } from "@/lib/dateFilter";
import {
  CategoryAnalysisRow,
  ComparisonValue,
  CustomerSummary,
  KpiDashboardData,
  ProductAnalysisRow,
  RevenuePeriodRow,
  RevenueSummary,
  RevenueTrendGranularity,
  RevenueTrendPoint,
  StaffAnalysisRow,
  TopCustomerRow,
} from "@/types/reportsBI";

// Reports Business Intelligence Center (Sprint v2.2.0). Every export here
// is a thin wrapper around one Postgres RPC function (see
// supabase/migrations/20260724_reports_bi_functions.sql) - all filtering,
// grouping and aggregation happens server-side (Feature 11); this module
// never fetches raw customer_purchases/sales_commissions rows to reduce in
// JS. Numbers are still passed through Number(...) defensively, matching
// the `Number(row.x) || 0` pattern already used everywhere else in this
// codebase's *.service.ts files, in case a numeric column ever comes back
// serialized as a string.
//
// Data Scope Rollout (Sprint v4.1), Package 6 / Decision 51 - Implementation
// Blocker, investigated and confirmed, not a design choice this module can
// route around. Every function below is a `.rpc()` call to a `LANGUAGE sql
// STABLE SECURITY INVOKER` function (supabase/migrations/20260724_reports_
// bi_functions.sql) with no scope-related parameter and no WHERE clause
// referencing `customer_purchases.salesperson_id`/`salesperson` at all
// (reports_revenue_periods, reports_revenue_summary, reports_category_
// analysis, reports_revenue_trend), or referencing them only to GROUP BY,
// never to restrict which rows count (reports_product_analysis,
// reports_customer_summary, reports_top_customers, reports_staff_analysis).
// PostgREST's `.rpc()` has no `.eq`/`.in`/`.or` chain to attach a filter to
// (unlike every other Package in this rollout) - the only place a filter
// could attach is inside the SQL function body itself, which requires
// altering that function's signature and/or WHERE clause: a database
// migration, out of bounds for this rollout (`DO NOT modify database`,
// `DO NOT modify RPCs`). `RLS` on `customer_purchases`/`sales_commissions`
// (`20260709_customer_purchases.sql`, `20260721_sales_commission_module.sql`)
// is a blanket `USING (true)` "Allow full access" for both `anon` and
// `authenticated` - SECURITY INVOKER inherits that same unrestricted
// access, so there is no RLS-level scoping to fall back on either. Fetching
// each function's full result and filtering rows afterward would violate
// Decision 41 ("never retrieve unrestricted data and filter afterward")
// outright - not attempted. `reports_customer_summary`/`reports_top_
// customers` additionally define "new" and "lifetime" against a customer's
// entire all-time purchase history regardless of range - scoping their
// per-salesperson figures would silently change what "new customer" means
// (first purchase a viewer can see, vs. first purchase ever), a business-
// rule question for the Product Owner, not a mechanical one an engineer can
// resolve unilaterally. `reports_staff_analysis` further blends a scoped
// source (`customer_purchases.salesperson_id`) with an unscoped one
// (`sales_commissions.salesperson_id`, outside this rollout's 8 named
// resources) in one query. Full RPC-by-RPC evidence: Decision 51
// investigation report. Every screen reading this module shows no Scope
// Indicator / an explicit "Chưa áp dụng phạm vi dữ liệu" label rather than
// implying these figures are scoped when they are not.

const TOP_N_DEFAULT = 10;

export async function getRevenuePeriods(): Promise<RevenuePeriodRow[]> {
  const { data, error } = await supabase.rpc("reports_revenue_periods");
  if (error || !data) {
    if (error) console.error("Error fetching revenue periods:", error);
    return [];
  }
  return (data as RevenuePeriodRow[]).map((r) => ({
    ...r,
    revenue: Number(r.revenue) || 0,
    transactions: Number(r.transactions) || 0,
    avg_sale: Number(r.avg_sale) || 0,
  }));
}

const EMPTY_REVENUE_SUMMARY: RevenueSummary = { revenue: 0, transactions: 0, avg_sale: 0 };

export async function getRevenueSummary(range: DateRange | null): Promise<RevenueSummary> {
  const { data, error } = await supabase.rpc("reports_revenue_summary", {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
  });
  if (error || !data || data.length === 0) {
    if (error) console.error("Error fetching revenue summary:", error);
    return EMPTY_REVENUE_SUMMARY;
  }
  const row = data[0];
  return {
    revenue: Number(row.revenue) || 0,
    transactions: Number(row.transactions) || 0,
    avg_sale: Number(row.avg_sale) || 0,
  };
}

export async function getProductAnalysis(
  range: DateRange | null,
  limit: number = TOP_N_DEFAULT
): Promise<ProductAnalysisRow[]> {
  const { data, error } = await supabase.rpc("reports_product_analysis", {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
    p_limit: limit,
  });
  if (error || !data) {
    if (error) console.error("Error fetching product analysis:", error);
    return [];
  }
  return (data as ProductAnalysisRow[]).map((r) => ({
    ...r,
    revenue: Number(r.revenue) || 0,
    transactions: Number(r.transactions) || 0,
    avg_sale: Number(r.avg_sale) || 0,
    contribution_pct: Number(r.contribution_pct) || 0,
  }));
}

export async function getCategoryAnalysis(range: DateRange | null): Promise<CategoryAnalysisRow[]> {
  const { data, error } = await supabase.rpc("reports_category_analysis", {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
  });
  if (error || !data) {
    if (error) console.error("Error fetching category analysis:", error);
    return [];
  }
  return (data as CategoryAnalysisRow[]).map((r) => ({
    ...r,
    revenue: Number(r.revenue) || 0,
    transactions: Number(r.transactions) || 0,
    contribution_pct: Number(r.contribution_pct) || 0,
  }));
}

const EMPTY_CUSTOMER_SUMMARY: CustomerSummary = { new_customers: 0, returning_customers: 0, avg_purchase: 0 };

export async function getCustomerSummary(range: DateRange | null): Promise<CustomerSummary> {
  const { data, error } = await supabase.rpc("reports_customer_summary", {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
  });
  if (error || !data || data.length === 0) {
    if (error) console.error("Error fetching customer summary:", error);
    return EMPTY_CUSTOMER_SUMMARY;
  }
  const row = data[0];
  return {
    new_customers: Number(row.new_customers) || 0,
    returning_customers: Number(row.returning_customers) || 0,
    avg_purchase: Number(row.avg_purchase) || 0,
  };
}

export async function getTopCustomers(
  range: DateRange | null,
  limit: number = TOP_N_DEFAULT
): Promise<TopCustomerRow[]> {
  const { data, error } = await supabase.rpc("reports_top_customers", {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
    p_limit: limit,
  });
  if (error || !data) {
    if (error) console.error("Error fetching top customers:", error);
    return [];
  }
  return (data as TopCustomerRow[]).map((r) => ({
    ...r,
    period_revenue: Number(r.period_revenue) || 0,
    period_transactions: Number(r.period_transactions) || 0,
    avg_sale: Number(r.avg_sale) || 0,
    lifetime_revenue: Number(r.lifetime_revenue) || 0,
  }));
}

export async function getStaffAnalysis(
  range: DateRange | null,
  limit: number = TOP_N_DEFAULT
): Promise<StaffAnalysisRow[]> {
  const { data, error } = await supabase.rpc("reports_staff_analysis", {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
    p_limit: limit,
  });
  if (error || !data) {
    if (error) console.error("Error fetching staff analysis:", error);
    return [];
  }
  return (data as StaffAnalysisRow[]).map((r) => ({
    ...r,
    revenue: Number(r.revenue) || 0,
    transactions: Number(r.transactions) || 0,
    avg_sale: Number(r.avg_sale) || 0,
    commission: Number(r.commission) || 0,
  }));
}

export async function getRevenueTrend(
  range: DateRange | null,
  granularity: RevenueTrendGranularity
): Promise<RevenueTrendPoint[]> {
  const { data, error } = await supabase.rpc("reports_revenue_trend", {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
    p_granularity: granularity,
  });
  if (error || !data) {
    if (error) console.error("Error fetching revenue trend:", error);
    return [];
  }
  return (data as RevenueTrendPoint[]).map((r) => ({
    ...r,
    revenue: Number(r.revenue) || 0,
    transactions: Number(r.transactions) || 0,
  }));
}

/**
 * Feature 10 - KPI Dashboard. Composes the same range-scoped
 * queries the other sections already fetch (revenue summary, customer
 * summary, top-1 product, top-1 staff, top-1 customer) rather than adding
 * a ninth RPC - every number here is one of Revenue/Transactions/Average
 * Sale/New Customers/Returning Customers/Top Product/Top Customer/Top
 * Staff/Commission, with Commission the sum across every staff member's
 * commission this range (reports_staff_analysis with a high limit - still
 * a handful of GROUP BY rows server-side, not a raw-row fetch).
 *
 * Sprint v2.2.0 Revision 1, Decision 19 (Comparison KPI) - `previousRange`
 * is the caller's own getPreviousEquivalentRange() result; `null` means
 * there is no previous-equivalent period (the "all_time" option), in which
 * case the previous-period RPCs are skipped entirely rather than called
 * with `null` - passing `null` to these functions means "no date bound at
 * all" (i.e. all-time), not "empty/no data", so it would silently return
 * the wrong number (grand-total-ever) as if it were "the previous period".
 */
function buildComparison(current: number, previous: number | null): ComparisonValue {
  if (previous === null) return { current, previous: null, changePct: null };
  if (previous === 0) return { current, previous, changePct: current === 0 ? 0 : null };
  return { current, previous, changePct: ((current - previous) / previous) * 100 };
}

export async function getKpiDashboard(
  range: DateRange | null,
  previousRange: DateRange | null
): Promise<KpiDashboardData> {
  const [revenue, customers, topProducts, staffRows, topCustomers] = await Promise.all([
    getRevenueSummary(range),
    getCustomerSummary(range),
    getProductAnalysis(range, 1),
    getStaffAnalysis(range, 1000),
    getTopCustomers(range, 1),
  ]);
  const commission = staffRows.reduce((sum, s) => sum + s.commission, 0);

  let prevRevenue: RevenueSummary | null = null;
  let prevCustomers: CustomerSummary | null = null;
  let prevCommission: number | null = null;
  if (previousRange) {
    const [pr, pc, prevStaffRows] = await Promise.all([
      getRevenueSummary(previousRange),
      getCustomerSummary(previousRange),
      getStaffAnalysis(previousRange, 1000),
    ]);
    prevRevenue = pr;
    prevCustomers = pc;
    prevCommission = prevStaffRows.reduce((sum, s) => sum + s.commission, 0);
  }

  return {
    hasData: revenue.transactions > 0,
    revenue: buildComparison(revenue.revenue, prevRevenue?.revenue ?? null),
    transactions: buildComparison(revenue.transactions, prevRevenue?.transactions ?? null),
    avgSale: buildComparison(revenue.avg_sale, prevRevenue?.avg_sale ?? null),
    newCustomers: buildComparison(customers.new_customers, prevCustomers?.new_customers ?? null),
    returningCustomers: buildComparison(customers.returning_customers, prevCustomers?.returning_customers ?? null),
    commission: buildComparison(commission, prevCommission),
    topProduct: topProducts[0] ?? null,
    topStaff: staffRows[0] ?? null,
    topCustomer: topCustomers[0] ?? null,
  };
}
