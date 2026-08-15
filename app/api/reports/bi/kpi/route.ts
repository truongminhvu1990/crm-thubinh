import { NextRequest, NextResponse } from "next/server";
import { getKpiDashboard } from "@/lib/reports/reportsBI.service";
import { createClient } from "@/lib/supabase/server";
import { parseDateRangeParams } from "../../_shared";
import { requirePermission } from "@/lib/permission/serverAuth";

/** Backend API Foundation (Package 4C, Wave 4). previousRange is computed
 * client-side (getPreviousEquivalentRange) exactly as before and passed
 * through as its own start/end pair - no recomputation here.
 *
 * Reporting API Permission Enforcement (docs/REPORTING_MASTER_SPEC.md §12,
 * LOCKED Rev 3) — Product Owner Implementation Directive, 2026-08-15:
 * gated by `reports.view` — this is a `/reports` dashboard consumer, not
 * `/business-intelligence`, so it uses the same key as every other report
 * route, not `business_intelligence.view`. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const range = parseDateRangeParams(searchParams);
  const previousRange = parseDateRangeParams(searchParams, "prevStart", "prevEnd");

  const client = await createClient();
  const data = await getKpiDashboard(range, previousRange, client);
  return NextResponse.json(data);
}
