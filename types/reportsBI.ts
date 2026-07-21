// Reports Business Intelligence Center (Sprint v2.2.0). Every shape here
// mirrors one RPC function's RETURNS TABLE in
// supabase/migrations/20260724_reports_bi_functions.sql - nothing on these
// types is ever computed client-side; the service layer only reads them.

export type RevenuePeriodKey = "today" | "this_week" | "this_month" | "this_quarter" | "this_year";

export interface RevenuePeriodRow {
  period_key: RevenuePeriodKey;
  revenue: number;
  transactions: number;
  avg_sale: number;
  period_start: string;
  period_end: string;
}

export interface RevenueSummary {
  revenue: number;
  transactions: number;
  avg_sale: number;
}

export interface ProductAnalysisRow {
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  revenue: number;
  transactions: number;
  avg_sale: number;
  contribution_pct: number;
}

export interface CategoryAnalysisRow {
  category: string;
  revenue: number;
  transactions: number;
  contribution_pct: number;
}

export interface CustomerSummary {
  new_customers: number;
  returning_customers: number;
  avg_purchase: number;
}

export interface TopCustomerRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  period_revenue: number;
  period_transactions: number;
  avg_sale: number;
  lifetime_revenue: number;
}

export interface StaffAnalysisRow {
  staff_id: string;
  staff_code: string;
  full_name: string;
  revenue: number;
  transactions: number;
  avg_sale: number;
  commission: number;
}

export type RevenueTrendGranularity = "day" | "week" | "month" | "year";

export interface RevenueTrendPoint {
  bucket: string;
  revenue: number;
  transactions: number;
}

// Sprint v2.2.0 Revision 1, Decision 19 - Comparison KPI. `previous: null`
// means there is no previous-equivalent period at all (the "all_time"
// option has no predecessor); `changePct: null` means a percentage isn't
// meaningful to show (no previous period, or previous was 0 - a "0 -> N"
// change isn't a finite percentage).
export interface ComparisonValue {
  current: number;
  previous: number | null;
  changePct: number | null;
}

export interface KpiDashboardData {
  /** Decision 20 - Empty State: true iff this period has zero transactions
   * at all, in which case every numeric tile should show the "No sales
   * data" message instead of a 0. */
  hasData: boolean;
  revenue: ComparisonValue;
  transactions: ComparisonValue;
  avgSale: ComparisonValue;
  newCustomers: ComparisonValue;
  returningCustomers: ComparisonValue;
  commission: ComparisonValue;
  topProduct: ProductAnalysisRow | null;
  topStaff: StaffAnalysisRow | null;
  topCustomer: TopCustomerRow | null;
}
