import { NextRequest, NextResponse } from "next/server";
import { getUnrecognizedOrderDetail } from "@/lib/orders/orderValueSummary.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOverviewRange } from "../_params";

/** Overview drill-down: "Giá trị chưa ghi nhận". Exactly the non-Lost orders
 * that are not Completed + Paid, one row per order with paid / remaining
 * amounts and the reason it is not recognized. `total` equals the Dashboard
 * figure for the same `start`/`end`. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const parsed = parseOverviewRange(request.nextUrl.searchParams);
  if ("error" in parsed) return parsed.error;

  const client = await createClient();
  const detail = await getUnrecognizedOrderDetail(parsed.range, auth.staff, client);

  return NextResponse.json({ metric: "unrecognized_value", range: parsed.range, ...detail });
}
