import { NextRequest, NextResponse } from "next/server";
import { Staff } from "@/types/staff";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { resolveRoleForStaff } from "@/lib/permission/permissionCenter.service";

/** Expense Management (Product Owner Decision, 2026-07-28): Owner = Full
 * Access, Manager = Create/Edit/Delete, Staff = View only. A fixed role-key
 * mapping enforced server-side, not via RLS or role_data_scopes - same
 * pattern already used for Orders writes (app/api/orders/_authorization.ts)
 * and for Gross Profit visibility on this exact report
 * (lib/monthlySoldProducts/monthlySoldProducts.service.ts's
 * canViewCostAndProfit). Unlike Orders, there's no per-record Data Scope
 * (team/own) here - the approval only names two tiers, write or view-only. */
const EXPENSE_WRITE_ROLE_KEYS = new Set(["Owner", "Manager"]);

export async function authorizeExpenseWrite(request: NextRequest): Promise<{ staff: Staff } | { error: NextResponse }> {
  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await resolveRoleForStaff(staff);
  if (!role || !EXPENSE_WRITE_ROLE_KEYS.has(role.role_key)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { staff };
}
