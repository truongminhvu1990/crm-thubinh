import { NextRequest, NextResponse } from "next/server";
import { getProductReportData, getBatchStaticReportData, getPurchaseReportData } from "@/lib/reports/reports.service";
import { getOrderValueSummary } from "@/lib/orders/orderValueSummary.service";
import { getCustomerStats } from "@/lib/customer.service";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { DateRange } from "@/lib/dateFilter";

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
 * Recognized Revenue source of truth for this endpoint - untouched. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const range: DateRange | null = start && end ? { start, end } : null;

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);

  const [customers, products, batches, purchases, orderValue] = await Promise.all([
    getCustomerStats(client, staff),
    getProductReportData(client),
    getBatchStaticReportData(client),
    getPurchaseReportData(range, client, staff),
    getOrderValueSummary(range, staff, client),
  ]);

  const unrecognizedOrderValue = orderValue.orderBasedUnrecognizedValue;

  return NextResponse.json({ customers, products, batches, purchases, orderValue, unrecognizedOrderValue });
}
