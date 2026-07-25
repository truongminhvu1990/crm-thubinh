import { NextRequest, NextResponse } from "next/server";
import { getProductReportData, getBatchStaticReportData, getPurchaseReportData } from "@/lib/reports/reports.service";
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
 * pattern as Hotfix 3A/4A - not invented for Dashboard. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const range: DateRange | null = start && end ? { start, end } : null;

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);

  const [customers, products, batches, purchases] = await Promise.all([
    getCustomerStats(client, staff),
    getProductReportData(client),
    getBatchStaticReportData(client),
    getPurchaseReportData(range, client, staff),
  ]);

  return NextResponse.json({ customers, products, batches, purchases });
}
