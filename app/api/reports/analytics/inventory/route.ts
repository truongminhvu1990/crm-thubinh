import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { getInventoryBreakdown } from "@/lib/reports/inventoryValue.service";

/** Dashboard biểu đồ Wave B (F9): "Tồn kho hiện tại" - Held (status Reserved) and Remaining (status Available) by products.category, as a
 * count of product records and the SUM of products.sale_price. CURRENT state: no date range exists, so any `start`/`end` sent by the
 * Dashboard is ignored. Σ over the categories equals the Held / Remaining cards (same rows as getInventoryValueSummary). The payload
 * carries no cost and no gross profit for any role. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const breakdown = await getInventoryBreakdown(client);
  if (!breakdown) return NextResponse.json({ error: "Không đọc được dữ liệu" }, { status: 500 });

  return NextResponse.json({ range: null, ...breakdown });
}
