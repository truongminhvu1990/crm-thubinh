import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { isDateFilterOption } from "@/lib/dateFilter";
import { parseOverviewRange } from "../../overview/_params";
import { getPeriodComparison } from "@/lib/reports/analytics/comparison.service";

/** Dashboard biểu đồ Wave A (F1 + F2): the period's figures and the previous equivalent period's, with delta and % change.
 * `option` is the Dashboard's date preset (it decides what "previous equivalent" means); `start`/`end` as the Dashboard (end exclusive).
 * Cost and gross profit are only ever present for Owner/Manager; for everyone else they are null in the payload. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const parsed = parseOverviewRange(searchParams);
  if ("error" in parsed) return parsed.error;

  const option = searchParams.get("option");
  if (!isDateFilterOption(option)) {
    return NextResponse.json({ error: "option must be a valid date filter option" }, { status: 400 });
  }
  if (option === "all_time" ? parsed.range !== null : parsed.range === null) {
    return NextResponse.json({ error: "range does not match option" }, { status: 400 });
  }

  try {
    const client = await createClient();
    return NextResponse.json(await getPeriodComparison(option, parsed.range, client, auth.staff));
  } catch (error) {
    console.error("Period comparison failed:", error);
    return NextResponse.json({ error: "Không tải được so sánh kỳ" }, { status: 500 });
  }
}
