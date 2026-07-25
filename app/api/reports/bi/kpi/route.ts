import { NextRequest, NextResponse } from "next/server";
import { getKpiDashboard } from "@/lib/reports/reportsBI.service";
import { createClient } from "@/lib/supabase/server";
import { parseDateRangeParams } from "../../_shared";

/** Backend API Foundation (Package 4C, Wave 4). previousRange is computed
 * client-side (getPreviousEquivalentRange) exactly as before and passed
 * through as its own start/end pair - no recomputation here. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const range = parseDateRangeParams(searchParams);
  const previousRange = parseDateRangeParams(searchParams, "prevStart", "prevEnd");

  const client = await createClient();
  const data = await getKpiDashboard(range, previousRange, client);
  return NextResponse.json(data);
}
