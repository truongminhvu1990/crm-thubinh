import { NextRequest, NextResponse } from "next/server";
import { getRevenueSummary } from "@/lib/reports/reportsBI.service";
import { createClient } from "@/lib/supabase/server";
import { parseDateRangeParams } from "../../_shared";

/** Backend API Foundation (Package 4C, Wave 4). Shared by RevenueDashboardCards'
 * Custom Range card and ProfitSection - same as their existing shared use of
 * getRevenueSummary() directly. */
export async function GET(request: NextRequest) {
  const range = parseDateRangeParams(request.nextUrl.searchParams);
  const client = await createClient();
  const data = await getRevenueSummary(range, client);
  return NextResponse.json(data);
}
