import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOverviewRange } from "../../overview/_params";
import { CompositionReadError, getSalesComposition } from "@/lib/reports/analytics/composition.service";

/** Dashboard biểu đồ Wave B (F4 / F5 / F8): Top sản phẩm, Top loại sản phẩm and Nhóm giá, all from ONE read of the canonical recognized
 * purchase rows (BR-001 / BR-002, dated by sale_date). Read-only. `start`/`end` as the Dashboard (end exclusive; none = all time).
 * The payload carries no cost and no gross profit for any role. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const parsed = parseOverviewRange(request.nextUrl.searchParams);
  if ("error" in parsed) return parsed.error;

  try {
    const client = await createClient();
    return NextResponse.json(await getSalesComposition(parsed.range, client, auth.staff));
  } catch (error) {
    if (error instanceof CompositionReadError) return NextResponse.json({ error: error.message }, { status: 500 });
    console.error("Sales composition failed:", error);
    return NextResponse.json({ error: "Không tải được biểu đồ" }, { status: 500 });
  }
}
