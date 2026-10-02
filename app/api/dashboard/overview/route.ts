import { NextRequest, NextResponse } from "next/server";
import { getProductReportData, getBatchStaticReportData, getPurchaseReportData } from "@/lib/reports/reports.service";
import { getOrderValueSummary } from "@/lib/orders/orderValueSummary.service";
import { getOverviewMetrics } from "@/lib/reports/overviewMetrics.service";
import { getCustomerStats } from "@/lib/customer.service";
import { createClient } from "@/lib/supabase/server";
import { createRequestClient, getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { staffHasPermission } from "@/lib/permission/permissionCenter.service";
import { DateRange } from "@/lib/dateFilter";
import type { Staff } from "@/types/staff";

/** Backend API Foundation (Package 4C, Wave 5, revised) - Dashboard's
 * server-side read endpoint for the four widgets its main effect fetches
 * together via Promise.all: Customer stats, Product/Batch totals, and the
 * revenue widget. Every underlying function (getCustomerStats,
 * getProductReportData, getBatchStaticReportData, getPurchaseReportData) is
 * reused unchanged - only newly given an injectable client/staff parameter
 * (Customer/Reports modules' own business logic, filtering, and
 * calculations are untouched, per the Product Owner's clarification that
 * "Do NOT modify" means business logic, not architecture).
 *
 * Both getCustomerStats' and getPurchaseReportData's Data Scope resolution
 * use the Server Authentication Context (getCurrentStaffFromRequest), same
 * pattern as Hotfix 3A/4A - not invented for Dashboard.
 *
 * Revenue Management Visibility (2026-08-29) - `orderValue` (Total Order
 * Value + its Orders-population Recognized/Unrecognized split,
 * `getOrderValueSummary()`, `order_date`-based) is new.
 *
 * Order Revenue Visibility Semantic Gap fix (2026-08-29 follow-up):
 * `unrecognizedOrderValue` ("Giá trị đơn chưa ghi nhận", B3) is now taken
 * directly as `orderValue.orderBasedUnrecognizedValue` - it is NOT
 * `orderValue.totalOrderValue - purchases.totalRevenue` any more. That
 * subtraction was semantically wrong: `purchases.totalRevenue` (B2, still
 * `getPurchaseReportData()`, unchanged) can include BR-002 legacy
 * `customer_purchases` rows with no linked Order at all (confirmed present
 * on Dev), which are outside the Orders population `orderValue` describes
 * entirely - subtracting B2 from B1 would silently net out however much
 * legacy revenue existed in the period, understating "value of Orders not
 * yet recognized". B3 is instead computed entirely within the Orders
 * population (`lib/orders/orderValueSummary.service.ts`), so
 * `orderValue.totalOrderValue = orderValue.orderBasedRecognizedValue +
 * orderValue.orderBasedUnrecognizedValue` holds exactly regardless of any
 * legacy revenue. `purchases.totalRevenue` (B2) remains the one and only
 * Recognized Revenue source of truth for this endpoint - untouched.
 *
 * Reporting Foundation, Phase 1: the revenue/order/sold/inventory figures are
 * now produced by `getOverviewMetrics` (lib/reports/overviewMetrics.service.ts),
 * which calls the SAME canonical functions the drill-down endpoints under
 * /api/reports/overview/* are built on. `purchases`, `orderValue` and
 * `unrecognizedOrderValue` keep their exact previous shapes and values so the
 * current Dashboard UI is unaffected; `overview` is the new additive block
 * carrying all six Overview metrics (Tổng giá trị đơn hàng, Doanh thu đã ghi
 * nhận, Giá trị chưa ghi nhận, Hàng đang giữ, Hàng còn lại, Đã bán).
 *
 * Phase 1.4.2 - authorization boundary (Release Control, pre-approval): the
 * `overview` block is reporting data (Sold, and Held / Remaining inventory value
 * across ALL staff), so it requires `reports.view` - the same key every
 * /api/reports/* route enforces. A caller WITHOUT it receives exactly the
 * pre-Phase-1 response (customers, products, batches, purchases, orderValue,
 * unrecognizedOrderValue; no `overview`), computed by the same two functions as
 * before, and Sold / inventory are never even calculated for them. The legacy
 * keys' own authorization policy is deliberately NOT changed here. */
/** Fail closed: no staff row, or any error while resolving the grant, means NOT permitted. */
async function canViewReporting(request: NextRequest, staff: Staff | null): Promise<boolean> {
  if (!staff) return false;
  try {
    return await staffHasPermission(staff, "reports.view", createRequestClient(request));
  } catch (error) {
    console.error("Dashboard overview: reports.view check failed, treating as not permitted:", error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const range: DateRange | null = start && end ? { start, end } : null;

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const permitted = await canViewReporting(request, staff);

  const [customers, products, batches, revenue] = await Promise.all([
    getCustomerStats(client, staff),
    getProductReportData(client),
    getBatchStaticReportData(client),
    permitted
      ? getOverviewMetrics(range, client, staff)
      : Promise.all([getPurchaseReportData(range, client, staff), getOrderValueSummary(range, staff, client)]).then(
          ([purchases, orderValue]) => ({ metrics: null, purchases, orderValue })
        ),
  ]);
  const { metrics, purchases, orderValue } = revenue;

  // Identical to metrics.unrecognizedValue.value (same field, one definition).
  const unrecognizedOrderValue = orderValue.orderBasedUnrecognizedValue;

  return NextResponse.json({
    customers,
    products,
    batches,
    purchases,
    orderValue,
    unrecognizedOrderValue,
    ...(metrics ? { overview: metrics } : {}),
  });
}
