import { NextRequest, NextResponse } from "next/server";
import { getRevenueTrend } from "@/lib/reports/reportsBI.service";
import { RevenueTrendGranularity } from "@/types/reportsBI";
import { createClient } from "@/lib/supabase/server";
import { parseDateRangeParams } from "../../_shared";

/** Backend API Foundation (Package 4C, Wave 4). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const range = parseDateRangeParams(searchParams);
  const granularity = (searchParams.get("granularity") as RevenueTrendGranularity | null) ?? "day";

  const client = await createClient();
  const data = await getRevenueTrend(range, granularity, client);
  return NextResponse.json(data);
}
