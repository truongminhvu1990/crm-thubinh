import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DateRange } from "@/lib/dateFilter";
import { Staff } from "@/types/staff";
import { getPurchaseReportData, PurchaseReportData } from "@/lib/reports/reports.service";
import { getOrderValueSummary, OrderValueSummary } from "@/lib/orders/orderValueSummary.service";
import { getSoldTotals } from "@/lib/monthlySoldProducts/soldDataset";
import { getInventoryValueSummary } from "@/lib/reports/inventoryValue.service";

// Phase 1 - Reporting Foundation: the six Overview ("Tổng quan") metrics,
// each from exactly ONE canonical function - the same function its drill-down
// dataset is built on:
//
//  1. Tổng giá trị đơn hàng    orderValueSummary.getOrderValueSummary
//                              (non-Lost orders, orders.order_date, "orders" scope)
//                              drill-down: getOrderValueDetail
//  2. Doanh thu đã ghi nhận    reports.getPurchaseReportData().totalRevenue
//                              (customer_purchases.sale_date, BR-001 + BR-002, "revenue" scope)
//                              drill-down: getRecognizedRevenueDetail
//  3. Giá trị chưa ghi nhận    getOrderValueSummary().orderBasedUnrecognizedValue
//                              (orders population only; NOT total - recognized)
//                              drill-down: getUnrecognizedOrderDetail
//  4. Hàng đang giữ            inventoryValue.getInventoryValueSummary().held
//                              (products.status = 'Reserved', SUM(sale_price), current state)
//                              drill-down: getHeldInventoryDetail
//  5. Hàng còn lại             inventoryValue.getInventoryValueSummary().remaining
//                              (products.status = 'Available', SUM(sale_price), current state)
//                              drill-down: getRemainingInventoryDetail
//  6. Đã bán                   soldDataset.getSoldTotals().soldValue
//                              (LOCKED Sold definition, orders.order_date + BR-002 legacy)
//                              drill-down: getSoldDetail
//
// The six are DIFFERENT populations and are deliberately never combined:
// there is no "total = recognized + unrecognized" across metric 1/2, no
// "sold + held", and no "held + remaining" field in this object. The only
// exact identity is inside metric 1 (orders): total = Completed+Paid orders +
// metric 3.

export interface OverviewMetrics {
  /** null = "all time". */
  range: DateRange | null;
  totalOrderValue: { value: number; orderCount: number };
  recognizedRevenue: {
    value: number;
    /** BR-001 part: rows linked to a Completed + Paid Order. */
    linkedValue: number;
    /** BR-002 part: legacy rows with no linked Order. */
    legacyValue: number;
  };
  unrecognizedValue: { value: number; orderCount: number };
  /** null only if the inventory read itself failed. */
  held: { value: number; count: number; missingPriceCount: number } | null;
  remaining: { value: number; count: number; missingPriceCount: number } | null;
  /** null only if the Sold read itself failed. */
  sold: {
    value: number;
    recognizedValue: number;
    unrecognizedValue: number;
    orderCount: number;
    lineCount: number;
  } | null;
}

export interface OverviewData {
  metrics: OverviewMetrics;
  /** The same objects the metrics were derived from, handed back so callers
   * (the Dashboard route) never re-run these queries for the existing cards. */
  purchases: PurchaseReportData;
  orderValue: OrderValueSummary;
}

async function safely<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`Overview metric "${label}" failed:`, error);
    return null;
  }
}

/** `staff` keeps the repo-wide sentinel: explicit `Staff | null` = use it.
 * The Dashboard route always passes the server-resolved staff. */
export async function getOverviewMetrics(
  range: DateRange | null,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<OverviewData> {
  const [purchases, orderValue, sold, inventory] = await Promise.all([
    getPurchaseReportData(range, client, staff),
    getOrderValueSummary(range, staff, client),
    safely("sold", () => getSoldTotals({ page: 1, dateFrom: range?.start, dateTo: range?.end }, client, staff)),
    safely("inventory", () => getInventoryValueSummary(client)),
  ]);

  const metrics: OverviewMetrics = {
    range,
    totalOrderValue: { value: orderValue.totalOrderValue, orderCount: orderValue.totalOrderCount },
    recognizedRevenue: {
      value: purchases.totalRevenue,
      linkedValue: purchases.totalRevenue - purchases.legacyRecognizedRevenue,
      legacyValue: purchases.legacyRecognizedRevenue,
    },
    unrecognizedValue: { value: orderValue.orderBasedUnrecognizedValue, orderCount: orderValue.unrecognizedOrderCount },
    held: inventory ? { ...inventory.held } : null,
    remaining: inventory ? { ...inventory.remaining } : null,
    sold: sold
      ? {
          value: sold.soldValue,
          recognizedValue: sold.recognizedRevenue,
          unrecognizedValue: sold.unrecognizedValue,
          orderCount: sold.totalOrders,
          lineCount: sold.soldLines,
        }
      : null,
  };

  return { metrics, purchases, orderValue };
}
