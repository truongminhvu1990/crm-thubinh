import { NextRequest, NextResponse } from "next/server";
import { getCommissionBySalesperson } from "@/lib/commissionReporting/commissionReporting.repository";
import { parseDateRangeParams } from "@/app/api/reports/_shared";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";

/** ST-3 - Commission by Salesperson (docs/07_REPORTING_SPEC.md §8). Gated
 * by `reports.view`, same as every other report in Reporting's own six
 * categories (§13) - Commission Reporting is explicitly one of them, not a
 * new permission surface. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const range = parseDateRangeParams(request.nextUrl.searchParams);
  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const rows = await getCommissionBySalesperson(range, client, staff);
  return NextResponse.json({ rows });
}
