import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOverviewRange } from "../../overview/_params";
import { isTrendGranularity } from "@/lib/reports/analytics/buckets";
import {
  getSalesTrend,
  isTrendMetric,
  TrendForbiddenError,
  TrendReadError,
  TrendTooManyBucketsError,
} from "@/lib/reports/analytics/trend.service";

/** Dashboard biểu đồ Wave A (F3): canonical Sales Trend. Read-only. `metric` = totalOrderValue | sold | recognizedRevenue | grossProfit,
 * `granularity` = day | week | month | quarter | year, `start`/`end` as the Dashboard (end exclusive; none = all time).
 * grossProfit is Owner/Manager only and is refused (403) here, on the server. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const parsed = parseOverviewRange(searchParams);
  if ("error" in parsed) return parsed.error;

  const metric = searchParams.get("metric");
  if (!isTrendMetric(metric)) {
    return NextResponse.json({ error: "metric must be totalOrderValue, sold, recognizedRevenue or grossProfit" }, { status: 400 });
  }
  const granularity = searchParams.get("granularity");
  if (!isTrendGranularity(granularity)) {
    return NextResponse.json({ error: "granularity must be day, week, month, quarter or year" }, { status: 400 });
  }

  try {
    const client = await createClient();
    return NextResponse.json(await getSalesTrend(metric, granularity, parsed.range, client, auth.staff));
  } catch (error) {
    if (error instanceof TrendForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof TrendTooManyBucketsError) return NextResponse.json({ error: error.message }, { status: 422 });
    if (error instanceof TrendReadError) return NextResponse.json({ error: error.message }, { status: 500 });
    console.error("Sales trend failed:", error);
    return NextResponse.json({ error: "Không tải được xu hướng" }, { status: 500 });
  }
}
