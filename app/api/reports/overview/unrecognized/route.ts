import { NextRequest, NextResponse } from "next/server";
import { getUnrecognizedOrderDetail, getUnrecognizedProductDetail } from "@/lib/orders/orderValueSummary.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOrdersView, parseOverviewRange } from "../_params";

/** Overview drill-down: "Giá trị chưa ghi nhận". Exactly the non-Lost orders
 * that are not Completed + Paid, one row per order with paid / remaining
 * amounts and the reason it is not recognized. `total` equals the Dashboard
 * figure for the same `start`/`end`.
 *
 * Phase 1.5A: `view=products` returns the same orders by product line (plus one explicit "no product" row per order
 * without lines); `total` is still the canonical total and `rowsTotal` the independent sum of the rows. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const parsed = parseOverviewRange(request.nextUrl.searchParams);
  if ("error" in parsed) return parsed.error;

  const viewParam = parseOrdersView(request.nextUrl.searchParams);
  if ("error" in viewParam) return viewParam.error;

  const client = await createClient();
  if (viewParam.view === "products") {
    const detail = await getUnrecognizedProductDetail(parsed.range, auth.staff, client);
    return NextResponse.json({ metric: "unrecognized_value", view: "products", range: parsed.range, ...detail });
  }
  const detail = await getUnrecognizedOrderDetail(parsed.range, auth.staff, client);

  return NextResponse.json({ metric: "unrecognized_value", range: parsed.range, ...detail });
}
