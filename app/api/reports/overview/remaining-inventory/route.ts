import { NextRequest, NextResponse } from "next/server";
import { getRemainingInventoryDetail } from "@/lib/reports/inventoryValue.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseInventoryFilters } from "../_params";

/** Overview drill-down: "Hàng còn lại". Current state - every product whose
 * status is Available, valued at products.sale_price. No date range applies.
 * `total` equals the Dashboard figure. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const detail = await getRemainingInventoryDetail(client, parseInventoryFilters(request.nextUrl.searchParams));

  return NextResponse.json({ metric: "remaining_inventory", range: null, ...detail });
}
