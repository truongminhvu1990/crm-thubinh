import { NextRequest, NextResponse } from "next/server";
import { getRecognizedRevenueDetail } from "@/lib/reports/reports.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOverviewRange } from "../_params";

/** Overview drill-down: "Doanh thu đã ghi nhận". One row per recognized
 * customer_purchases row (BR-001 linked to a Completed + Paid order, BR-002
 * legacy with no order) by `sale_date`. `total` equals the Dashboard figure
 * for the same `start`/`end`. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const parsed = parseOverviewRange(request.nextUrl.searchParams);
  if ("error" in parsed) return parsed.error;

  const client = await createClient();
  const detail = await getRecognizedRevenueDetail(parsed.range, client, auth.staff);

  return NextResponse.json({ metric: "recognized_revenue", range: parsed.range, ...detail });
}
