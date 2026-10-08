import { SupabaseClient } from "@supabase/supabase-js";
import { DateFilterOption, DateRange, getPreviousEquivalentRange } from "@/lib/dateFilter";
import { Staff } from "@/types/staff";
import { getPurchaseReportData } from "@/lib/reports/reports.service";
import { getOrderValueSummary } from "@/lib/orders/orderValueSummary.service";
import { getSoldTotals } from "@/lib/monthlySoldProducts/soldDataset";
import { canViewCostAndProfit } from "@/lib/monthlySoldProducts/monthlySoldProducts.service";
import { computeDelta, DeltaValue, safeRatio } from "./delta";

// Dashboard biểu đồ - Wave A (F1 additions + F2 So sánh kỳ). Each figure of a period comes from the SAME canonical function the
// Dashboard KPI uses (getOrderValueSummary / getPurchaseReportData / getSoldTotals); nothing here recomputes a business rule. The previous
// period is getPreviousEquivalentRange (the filter's own definition). Inventory (Hàng đang giữ / còn lại) is a current-state snapshot with no
// period, so it is not part of a period comparison and is not read here.

export interface PeriodMetrics {
  /** Order date basis. */
  totalOrderValue: number;
  orderCount: number;
  /** Sold population (order date basis, BR-002 legacy by sale_date). */
  sold: number;
  soldOrderCount: number;
  soldLineCount: number;
  /** sold / soldOrderCount; null when there is no sold order. */
  avgSoldOrderValue: number | null;
  /** Sale date basis, BR-001 + BR-002. */
  recognizedRevenue: number;
  /** null when the caller may not see cost/profit (never sent, not just hidden). */
  cost: number | null;
  grossProfit: number | null;
}

export type ComparisonKey = keyof PeriodMetrics;

export interface PeriodComparison {
  range: DateRange | null;
  previousRange: DateRange | null;
  canViewCostAndProfit: boolean;
  current: PeriodMetrics;
  /** null when there is no previous equivalent period (all time). */
  previous: PeriodMetrics | null;
  comparison: Record<ComparisonKey, DeltaValue> | null;
}

export async function getPeriodMetrics(range: DateRange | null, client: SupabaseClient, staff: Staff | null, withCost: boolean): Promise<PeriodMetrics> {
  const [purchases, orderValue, sold] = await Promise.all([
    getPurchaseReportData(range, client, staff),
    getOrderValueSummary(range, staff, client),
    getSoldTotals({ page: 1, dateFrom: range?.start, dateTo: range?.end }, client, staff),
  ]);
  return {
    totalOrderValue: orderValue.totalOrderValue,
    orderCount: orderValue.totalOrderCount,
    sold: sold.soldValue,
    soldOrderCount: sold.totalOrders,
    soldLineCount: sold.soldLines,
    avgSoldOrderValue: safeRatio(sold.soldValue, sold.totalOrders),
    recognizedRevenue: purchases.totalRevenue,
    cost: withCost ? purchases.totalCost : null,
    grossProfit: withCost ? purchases.totalProfit : null,
  };
}

export function compareMetrics(current: PeriodMetrics, previous: PeriodMetrics): Record<ComparisonKey, DeltaValue> {
  const keys = Object.keys(current) as ComparisonKey[];
  const out = {} as Record<ComparisonKey, DeltaValue>;
  for (const k of keys) out[k] = computeDelta(current[k], previous[k]);
  return out;
}

export async function getPeriodComparison(
  option: DateFilterOption,
  range: DateRange | null,
  client: SupabaseClient,
  staff: Staff | null
): Promise<PeriodComparison> {
  const withCost = await canViewCostAndProfit(staff, client);
  const previousRange = getPreviousEquivalentRange(option, range);
  const [current, previous] = await Promise.all([
    getPeriodMetrics(range, client, staff, withCost),
    previousRange ? getPeriodMetrics(previousRange, client, staff, withCost) : Promise.resolve(null),
  ]);
  return {
    range,
    previousRange,
    canViewCostAndProfit: withCost,
    current,
    previous,
    comparison: previous ? compareMetrics(current, previous) : null,
  };
}
