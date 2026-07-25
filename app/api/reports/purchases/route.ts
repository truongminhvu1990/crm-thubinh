import { NextRequest, NextResponse } from "next/server";
import { getPurchaseReportData } from "@/lib/reports/reports.service";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { parseDateRangeParams } from "../_shared";

/** Backend API Foundation (Package 4C, Wave 4 / Hotfix 4A). "Current staff"
 * for the repository's Data Scope call is now resolved via
 * getCurrentStaffFromRequest (Server Authentication Context, the same
 * request-cookie-based resolver Orders/Permission Center/Sales Ledger
 * already use - Hotfix 3A), not getPurchaseReportData's own default
 * (Browser Authentication Context, a no-op in a Route Handler). Nothing
 * about Permission/Data Scope/query/filtering/RPC logic changed - only how
 * "who is calling" gets identified. */
export async function GET(request: NextRequest) {
  const range = parseDateRangeParams(request.nextUrl.searchParams);
  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const data = await getPurchaseReportData(range, client, staff);
  return NextResponse.json(data);
}
