import { NextRequest, NextResponse } from "next/server";
import { getOrderValueDetail, getOrderValueProductDetail } from "@/lib/orders/orderValueSummary.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOrdersView, parseOverviewRange } from "../_params";

/** Overview drill-down: "Tổng giá trị đơn hàng". Non-Lost orders by
 * `order_date`, one row per order. `total` equals the Dashboard figure for
 * the same `start`/`end`. All calculation lives in getOrderValueDetail -
 * this route only authenticates, parses and forwards.
 *
 * Phase 1.5A: `view=products` returns the same order population by product line (plus one explicit "no product" row per
 * order without lines); `total` is still the canonical total and `rowsTotal` is the independent sum of the rows. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const parsed = parseOverviewRange(request.nextUrl.searchParams);
  if ("error" in parsed) return parsed.error;

  const viewParam = parseOrdersView(request.nextUrl.searchParams);
  if ("error" in viewParam) return viewParam.error;

  const client = await createClient();
  if (viewParam.view === "products") {
    const detail = await getOrderValueProductDetail(parsed.range, auth.staff, client);
    return NextResponse.json({ metric: "total_order_value", view: "products", range: parsed.range, ...detail });
  }
  const detail = await getOrderValueDetail(parsed.range, auth.staff, client);

  return NextResponse.json({ metric: "total_order_value", range: parsed.range, ...detail });
}
