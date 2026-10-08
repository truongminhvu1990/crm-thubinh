import { SupabaseClient } from "@supabase/supabase-js";
import { DateRange } from "@/lib/dateFilter";
import { Staff } from "@/types/staff";
import { fetchPurchaseRows, loadCostByProductId } from "@/lib/reports/reports.service";
import { isPurchaseRecognized } from "@/lib/reports/revenueDefinition";
import { loadOrderValueOrders } from "@/lib/orders/orderValueSummary.service";
import { canViewCostAndProfit } from "@/lib/monthlySoldProducts/monthlySoldProducts.service";
import * as soldRepo from "@/lib/monthlySoldProducts/monthlySoldProducts.repository";
import { TrendGranularity } from "./buckets";
import { buildTrendPoints, ExcludedRows, TrendItem, TrendPoint } from "./aggregate";

// Dashboard biểu đồ - Wave A (F3). The Sales Trend is the canonical rows of each KPI, grouped by that KPI's OWN date column:
//
//   totalOrderValue    -> loadOrderValueOrders      (the query behind "Tổng giá trị đơn hàng")  by orders.order_date
//   sold               -> soldRepo.getSoldLines     (the LOCKED Sold population)                 by order date / BR-002 sale_date
//   recognizedRevenue  -> fetchPurchaseRows + BR-001/BR-002 predicate (the query behind the KPI)  by customer_purchases.sale_date
//   grossProfit        -> the same recognized rows, minus loadCostByProductId (the KPI's cost rule) by sale_date
//
// No formula is re-implemented here: this file only picks the date and the per-row value out of rows the KPI already reads, so the sum
// of the buckets (+ the disclosed excluded rows) is, by construction, the KPI for the same range.

export type TrendMetric = "totalOrderValue" | "sold" | "recognizedRevenue" | "grossProfit";

export const TREND_METRICS: readonly TrendMetric[] = ["totalOrderValue", "sold", "recognizedRevenue", "grossProfit"];

export function isTrendMetric(value: unknown): value is TrendMetric {
  return typeof value === "string" && (TREND_METRICS as readonly string[]).includes(value);
}

/** Which column places a row on the time axis. Shown to the user: recognized revenue / gross profit are "theo ngày bán". */
export type TrendDateBasis = "order_date" | "sale_date";

export const TREND_DATE_BASIS: Record<TrendMetric, TrendDateBasis> = {
  totalOrderValue: "order_date",
  sold: "order_date",
  recognizedRevenue: "sale_date",
  grossProfit: "sale_date",
};

export interface SalesTrend {
  metric: TrendMetric;
  granularity: TrendGranularity;
  range: DateRange | null;
  dateBasis: TrendDateBasis;
  points: TrendPoint[];
  /** = the KPI for the same range (buckets + excluded). */
  total: number;
  /** Rows whose date is not a valid calendar date: counted in `total`, placed in no bucket, never hidden. */
  excluded: ExcludedRows;
  /** grossProfit only: recognized lines whose product has no cost_price (their cost counts 0, exactly as in the KPI). */
  missingCostLines?: number;
}

export class TrendForbiddenError extends Error {
  constructor() {
    super("Chỉ Owner/Manager được xem Lợi nhuận gộp");
    this.name = "TrendForbiddenError";
  }
}
export class TrendTooManyBucketsError extends Error {
  constructor() {
    super("Khoảng thời gian quá dài cho độ chi tiết này");
    this.name = "TrendTooManyBucketsError";
  }
}
export class TrendReadError extends Error {
  constructor() {
    super("Không đọc được dữ liệu");
    this.name = "TrendReadError";
  }
}

export async function getSalesTrend(
  metric: TrendMetric,
  granularity: TrendGranularity,
  range: DateRange | null,
  client: SupabaseClient,
  staff: Staff | null
): Promise<SalesTrend> {
  // Enforced HERE on the server, before any cost row is read: a caller that may not see profit gets no profit.
  if (metric === "grossProfit" && !(await canViewCostAndProfit(staff, client))) throw new TrendForbiddenError();

  let items: TrendItem[] = [];
  let missingCostLines: number | undefined;

  if (metric === "totalOrderValue") {
    const orders = await loadOrderValueOrders(range, staff, client);
    if (!orders) throw new TrendReadError();
    items = orders.map((o) => ({ date: o.order_date, value: Number(o.total_amount) || 0 }));
  } else if (metric === "sold") {
    const lines = await soldRepo.getSoldLines({ page: 1, dateFrom: range?.start, dateTo: range?.end }, client, staff);
    items = lines.map((l) => ({ date: l.sale_date, value: l.final_sale_price }));
  } else {
    const { data, error } = await fetchPurchaseRows(range, client, staff);
    if (error || !data) throw new TrendReadError();
    const recognized = data.filter((row) => isPurchaseRecognized(row));
    if (metric === "recognizedRevenue") {
      items = recognized.map((row) => ({ date: row.sale_date, value: Number(row.sale_price) || 0 }));
    } else {
      const cost = await loadCostByProductId(client, recognized);
      missingCostLines = 0;
      items = recognized.map((row) => {
        const c = row.product_id ? cost.get(row.product_id) : undefined;
        if (c === undefined) missingCostLines = (missingCostLines ?? 0) + 1;
        return { date: row.sale_date, value: (Number(row.sale_price) || 0) - (c ?? 0) };
      });
    }
  }

  const built = buildTrendPoints(items, granularity, range);
  if (!built.ok) throw new TrendTooManyBucketsError();
  return {
    metric,
    granularity,
    range,
    dateBasis: TREND_DATE_BASIS[metric],
    points: built.points,
    total: built.total,
    excluded: built.excluded,
    ...(missingCostLines !== undefined ? { missingCostLines } : {}),
  };
}
