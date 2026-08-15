import { NextRequest, NextResponse } from "next/server";
import { getCommissionAging } from "@/lib/commissionReporting/commissionReporting.repository";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";

/** ST-4 - Commission Aging (docs/06_COMMISSION_SPEC.md §16). Gated by
 * `reports.view`, same as ST-3. Current-state (no date filter) - see
 * commissionReporting.repository.ts's own comment on why. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const rows = await getCommissionAging(client, staff);
  return NextResponse.json({ rows });
}
