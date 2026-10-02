import { NextRequest, NextResponse } from "next/server";
import { getOrderValueDetail } from "@/lib/orders/orderValueSummary.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOverviewRange } from "../_params";

/** Overview drill-down: "Tổng giá trị đơn hàng". Non-Lost orders by
 * `order_date`, one row per order. `total` equals the Dashboard figure for
 * the same `start`/`end`. All calculation lives in getOrderValueDetail -
 * this route only authenticates, parses and forwards. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const parsed = parseOverviewRange(request.nextUrl.searchParams);
  if ("error" in parsed) return parsed.error;

  const client = await createClient();
  const detail = await getOrderValueDetail(parsed.range, auth.staff, client);

  return NextResponse.json({ metric: "total_order_value", range: parsed.range, ...detail });
}
