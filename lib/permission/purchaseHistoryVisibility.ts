import { Staff } from "@/types/staff";
import { resolveRoleForStaff } from "./permissionCenter.service";
import { getStaffByTeam } from "./permissionCenter.repository";

/** Customer Visibility Engine (Package 4B) — governs Purchase History,
 * Revenue, Payment History, Commission, and Previous Selling Price
 * visibility. Deliberately separate from Customer Profile's own visibility
 * (lib/customer.service.ts's getCustomers/getCustomerById, which is
 * unconditionally shared - see the Business Rules this package was built
 * against: "Customer Profile is a shared company asset" vs. "Purchase
 * History is NOT a shared asset. Visibility must be controlled
 * independently."). */
export type PurchaseHistoryVisibility = "all" | "team" | "own" | "hidden";

/** A value no real row can ever match - the default-deny filter, same
 * convention as lib/permission/dataScope.ts's NEVER_MATCHES. */
const NEVER_MATCHES = "00000000-0000-0000-0000-000000000000";

// ============================================================
// ================ FIXED VISIBILITY MAPPING ===================
//
// PRODUCT OWNER BUSINESS RULES (Package 4B, LOCKED) - Owner = View All,
// Manager = View Team, Sales = View Own, Marketing = Hidden. Built as a
// fixed mapping, deliberately bypassing role_data_scopes' admin-configurable
// "revenue" resource - same reasoning as Package 4A's
// ORDERS_WRITE_SCOPE_BY_ROLE_KEY (app/api/orders/_authorization.ts):
// "revenue" is still seeded 100% 'all' for every role
// (docs/PERMISSION_CENTER_INVESTIGATION_V2.md §B) and role_data_scopes has
// no "hidden" tier at all, so reading it as-is would not enforce
// Marketing = Hidden. Sales Ledger (lib/salesLedger/salesLedger.repository.ts)
// and Reports (lib/reports/reports.service.ts) keep reading role_data_scopes'
// "revenue" resource unchanged - out of this package's scope. This fixed
// mapping applies ONLY to the Purchase History/Revenue/Previous-Selling-Price
// surfaces reachable from Customer Profile and Product Detail
// (lib/purchase.service.ts).
//
// Any role absent from this map (Viewer, or an unresolvable role) defaults
// to "hidden" - default-deny, consistent with the rest of this codebase's
// Data Scope helpers.
// ============================================================
const PURCHASE_HISTORY_VISIBILITY_BY_ROLE_KEY: Record<string, PurchaseHistoryVisibility> = {
  Owner: "all",
  Manager: "team",
  Sales: "own",
  Marketing: "hidden",
};

export async function resolvePurchaseHistoryVisibility(
  staff: Pick<Staff, "role" | "role_id">
): Promise<PurchaseHistoryVisibility> {
  const role = await resolveRoleForStaff(staff);
  if (!role) return "hidden";
  return PURCHASE_HISTORY_VISIBILITY_BY_ROLE_KEY[role.role_key] ?? "hidden";
}

function normalizeName(name: string): string {
  return name.trim();
}

function escapeFilterValue(value: string): string {
  return /[,."()]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** Builds a PostgREST `.or()` filter string: "uuidField is one of these ids,
 * OR (uuidField is null AND textField, case-insensitive, matches one of
 * these names)". Each name gets its own `ilike` term joined by a nested
 * `or(...)` - `ilike` only ever accepts a single pattern, it is NOT a
 * multi-value operator, so a parenthesized name list (the form
 * lib/permission/dataScope.ts's own orGroup() uses) silently matches zero
 * rows. Confirmed live against this project's Development DB while
 * verifying this package: `salesperson.ilike.(Name)` returns 0 rows where
 * plain `salesperson.ilike.Name` returns the expected rows. Not fixed in
 * dataScope.ts itself (out of this package's scope to modify) - flagged to
 * the Product Owner separately; this file only guarantees its own filter
 * is correct. */
function orGroup(ids: string[], names: string[], uuidField: string, textField: string): string {
  const idList = ids.map(escapeFilterValue).join(",");
  const nameTerms = names.map((n) => `${textField}.ilike.${escapeFilterValue(normalizeName(n))}`).join(",");
  return `${uuidField}.in.(${idList}),and(${uuidField}.is.null,or(${nameTerms}))`;
}

interface VisibilityScopedQuery {
  eq(column: string, value: unknown): this;
  or(filters: string): this;
}

/**
 * Applies the signed-in staff member's resolved Purchase History visibility
 * as a filter on a Supabase query builder scoped to a uuid `salesperson_id`
 * column with a text `salesperson` fallback:
 *
 *   ({ query } = await applyPurchaseHistoryVisibility(query, staff, "salesperson_id", "salesperson"));
 *
 * - "all"    -> query returned unchanged.
 * - "own"    -> filtered to the staff member's own sales.
 * - "team"   -> filtered to the staff member's team's sales.
 * - "hidden" -> filtered to NEVER_MATCHES (zero rows), never a client-side
 *   post-filter and never a partial/redacted row - Marketing must see
 *   nothing, not an empty-looking version of something.
 */
export async function applyPurchaseHistoryVisibility<Q extends VisibilityScopedQuery>(
  query: Q,
  staff: Pick<Staff, "id" | "role" | "role_id" | "team_id" | "full_name">,
  uuidField: string,
  textField: string
): Promise<{ query: Q; visibility: PurchaseHistoryVisibility }> {
  const visibility = await resolvePurchaseHistoryVisibility(staff);

  if (visibility === "hidden") {
    return { query: query.eq(uuidField, NEVER_MATCHES) as Q, visibility };
  }
  if (visibility === "all") {
    return { query, visibility };
  }
  if (visibility === "own") {
    return { query: query.or(orGroup([staff.id], [staff.full_name], uuidField, textField)) as Q, visibility };
  }

  // visibility === "team"
  const teammates = staff.team_id ? await getStaffByTeam(staff.team_id) : [];
  const ids = teammates.length > 0 ? teammates.map((s) => s.id) : [staff.id];
  const names = teammates.length > 0 ? teammates.map((s) => s.full_name) : [staff.full_name];
  return { query: query.or(orGroup(ids, names, uuidField, textField)) as Q, visibility };
}
