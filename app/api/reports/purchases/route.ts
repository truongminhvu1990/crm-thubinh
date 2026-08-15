import { NextRequest, NextResponse } from "next/server";
import { getPurchaseReportData } from "@/lib/reports/reports.service";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";
import { parseDateRangeParams } from "../_shared";

/** Backend API Foundation (Package 4C, Wave 4 / Hotfix 4A). "Current staff"
 * for the repository's Data Scope call is now resolved via
 * getCurrentStaffFromRequest (Server Authentication Context, the same
 * request-cookie-based resolver Orders/Permission Center/Sales Ledger
 * already use - Hotfix 3A), not getPurchaseReportData's own default
 * (Browser Authentication Context, a no-op in a Route Handler). Nothing
 * about Permission/Data Scope/query/filtering/RPC logic changed - only how
 * "who is calling" gets identified.
 *
 * Reporting API Permission Enforcement (docs/REPORTING_MASTER_SPEC.md §12,
 * LOCKED Rev 3) — Product Owner Implementation Directive, 2026-08-15:
 * gated by `reports.view`, ahead of the existing Data Scope staff
 * resolution below (same two-call shape already established by
 * app/api/reports/payment-method/route.ts — requirePermission for the
 * gate, a separate getCurrentStaffFromRequest for Data Scope). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const range = parseDateRangeParams(request.nextUrl.searchParams);
  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const data = await getPurchaseReportData(range, client, staff);
  return NextResponse.json(data);
}
