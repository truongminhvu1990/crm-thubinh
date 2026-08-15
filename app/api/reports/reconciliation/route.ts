import { NextRequest, NextResponse } from "next/server";
import { getReportsReconciliation } from "@/lib/reportsReconciliation/reportsReconciliation.service";
import { parseDateRangeParams } from "@/app/api/reports/_shared";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { resolveRoleForStaff } from "@/lib/permission/permissionCenter.service";

/** E-3 — Unified Revenue Reconciliation View (§10, Decision Q-2). Gated by
 * role, not a new `reports.*` permission key — the spec's own field 14 is
 * explicit: "Owner-only. This surfaces a cross-system data-integrity
 * question, not an operational figure any other role needs." Reuses the
 * same direct `role.role_key === "Owner"` check already established for
 * Orders' own Owner-only DELETE override (app/api/orders/[id]/route.ts,
 * Product Owner Decision 2026-08-13) rather than inventing a new
 * `reconciliation.view`-style permission the spec never asked for. */
export async function GET(request: NextRequest) {
  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = await resolveRoleForStaff(staff);
  if (role?.role_key !== "Owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const range = parseDateRangeParams(request.nextUrl.searchParams);
  const client = await createClient();
  const reconciliation = await getReportsReconciliation(range, client);
  return NextResponse.json(reconciliation);
}
