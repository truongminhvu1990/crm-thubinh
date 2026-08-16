import { NextRequest, NextResponse } from "next/server";
import { Staff } from "@/types/staff";
import { Order } from "@/types/order";
import { Role } from "@/types/permissionCenter";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { resolveRoleForStaff } from "@/lib/permission/permissionCenter.service";
import { getStaffByTeam } from "@/lib/permission/permissionCenter.repository";

/** Authorization Engine V2 (Package 4A) — enforces Authentication, Permission,
 * and Data Scope for the 5 named Orders write endpoints (Complete, Record
 * Payment, Mark Lost, Reassign Owner, Delete). */
type OrderWriteScope = "all" | "team" | "own";

// ============================================================
// ============= TEMPORARY COMPATIBILITY LAYER ================
//
// PRODUCT OWNER REVIEW (Package 4A, PARTIAL APPROVED) — the fixed mapping
// below is accepted ONLY as a temporary compatibility layer, not as this
// package's final design. It exists solely because `role_data_scopes` for
// the `orders` resource is still seeded 100% 'all' for every role today
// (Permission Center's admin-configurable Data Scope — see
// docs/PERMISSION_CENTER_INVESTIGATION_V2.md §B) — reading that config as-is
// would not enforce Owner=All/Manager=Team/Sales=Own/Marketing=None right
// now. This hardcoded stand-in is what makes those rules real in the
// meantime, deliberately isolated to this one file/one module (Orders
// writes) so it can be deleted in one place later.
//
// Package 4D will REPLACE this entire block with a real read of Permission
// Center's Data Scope (`resolveRoleForStaff` + `getResolvedDataScope(role.id,
// "orders")` via `lib/permission/dataScope.ts`, the same mechanism the
// Orders GET routes already use), once `role_data_scopes` is reconfigured to
// match these rules (Package E in the investigation's own numbering) and a
// "Hidden"/no-access tier or equivalent exists for Marketing. Until then:
//
// - Do NOT copy `ORDERS_WRITE_SCOPE_BY_ROLE_KEY` or `isOrderInWriteScope`
//   into any other module. If another module needs a similar temporary
//   fixed-role mapping, that is a new, separately-flagged decision for the
//   Product Owner — not a precedent to silently reuse from here.
// - Do NOT export either symbol below outside this file.
// - When Package 4D lands, this whole block (down to the closing marker)
//   should be deleted, not extended.
// ============================================================

/** Owner = Access all Orders. Manager = Team Orders only. Sales = Own Orders
 * only. Marketing = No write access at all (absent from this map). Any other
 * role (Viewer, or an unresolvable role) also defaults to no write access —
 * default-deny, consistent with the rest of this codebase's Data Scope
 * helpers. */
const ORDERS_WRITE_SCOPE_BY_ROLE_KEY: Record<string, OrderWriteScope> = {
  Owner: "all",
  Manager: "team",
  Sales: "own",
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function isOrderInWriteScope(order: Order, staff: Staff, scope: OrderWriteScope): Promise<boolean> {
  if (scope === "all") return true;

  if (scope === "own") {
    return normalizeName(order.sales_owner) === normalizeName(staff.full_name);
  }

  // scope === "team"
  const teammates = staff.team_id ? await getStaffByTeam(staff.team_id) : [];
  const names = teammates.length > 0 ? teammates.map((s) => s.full_name) : [staff.full_name];
  return names.some((name) => normalizeName(name) === normalizeName(order.sales_owner));
}

// ============ END TEMPORARY COMPATIBILITY LAYER ==============
// ============================================================

/** Call after the target order has already been fetched (existence/404
 * checked first, unchanged from every route's existing behavior) — returns
 * either the resolved staff member (write may proceed) or a ready-to-return
 * 401/403 NextResponse. The returned `staff` is also the correct Audit Actor
 * for the write that follows (Product Owner review: actor must be the
 * current authenticated staff member, not the order's original creator) —
 * every call site should use `result.staff.full_name`, not
 * `order.created_by`, when invoking the orderService write. */
export async function authorizeOrderWrite(
  request: NextRequest,
  order: Order
): Promise<{ staff: Staff; role: Role } | { error: NextResponse }> {
  // 1. Authentication
  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // 2. Permission — does this role have any Orders write access at all?
  const role = await resolveRoleForStaff(staff);
  const scope = role ? ORDERS_WRITE_SCOPE_BY_ROLE_KEY[role.role_key] : undefined;
  if (!scope || !role) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  // 3. Data Scope — does this specific order fall within the role's scope?
  const inScope = await isOrderInWriteScope(order, staff, scope);
  if (!inScope) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  // Admin Order Delete/Reconciliation (Product Owner Decision, 2026-08-14) —
  // `role` is returned so the DELETE handler can resolve `adminOverride`
  // (role.role_key === "Owner") without a second staff/role lookup. Every
  // other existing call site of this function (Complete, Record Payment,
  // Mark Lost, Reassign Owner) is unaffected — they simply don't read the
  // new field.
  return { staff, role };
}
