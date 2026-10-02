import { NextRequest, NextResponse } from "next/server";
import { getHeldInventoryDetail } from "@/lib/reports/inventoryValue.service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseInventoryFilters } from "../_params";

/** Overview drill-down: "Hàng đang giữ". Current state - every product whose
 * status is Reserved, valued at products.sale_price, with the open order
 * holding it. No date range applies (a product is held now, not "in a
 * period"). `total` equals the Dashboard figure. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const detail = await getHeldInventoryDetail(client, parseInventoryFilters(request.nextUrl.searchParams));

  return NextResponse.json({ metric: "held_inventory", range: null, ...detail });
}
