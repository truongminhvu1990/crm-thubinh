import { SupabaseClient } from "@supabase/supabase-js";
import { Staff } from "@/types/staff";

/** Shared staff-identity resolution (Production Authorization Incident,
 * 2026-09-21) - the single algorithm both the browser-side
 * `lib/permission.ts#getCurrentStaff()` and the server-side
 * `lib/permission/serverAuth.ts#getCurrentStaffFromRequest()` now call,
 * replacing two independently-maintained implementations that had drifted:
 * the browser path only ever matched by `email`, with no `auth_user_id`
 * fallback. A staff row whose `email` no longer matches its linked
 * `auth.users.email` exactly (case, a changed login email, etc.) resolved
 * to a real staff member server-side but to `null` in the browser -
 * confirmed as the root cause of the Reports/Permission-Matrix incident:
 * one affected Production Owner row has `auth_user_id = NULL` and an
 * `email` matching no `auth.users` row at all, so it fails identity
 * resolution under either path today, but a future case where only the
 * `email` half breaks would otherwise have silently diverged between the
 * two callers.
 *
 * Resolution order (matches the pre-existing server-side priority,
 * unchanged - "Production Authentication Hotfix V2, Package 2"):
 *   1. `staff.auth_user_id` (stable FK, doesn't depend on email matching)
 *   2. `staff.email` (transitional fallback for any row not yet linked)
 *   3. Neither resolves -> null
 * Additionally requires `status === "Active"` (Staff Identity &
 * Authentication Foundation's StaffStatus model) - an Inactive/Locked/
 * Archived staff row must not resolve to a usable identity here. This is
 * strictly additive versus prior behavior: every staff row involved in the
 * incident investigation was already `status: "Active"`, so this does not
 * change any currently-working account's outcome; it only forecloses a
 * gap where a since-deactivated row would otherwise still authenticate. */
export async function resolveStaffFromAuthUser(
  client: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<Staff | null> {
  const { data: byAuthUserId, error: authUserIdError } = await client
    .from("staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (authUserIdError) {
    console.error("Error resolving current staff member by auth_user_id:", authUserIdError);
  }
  if (byAuthUserId) return activeOrNull(byAuthUserId as Staff);

  if (!user.email) return null;

  const { data: byEmail, error: emailError } = await client
    .from("staff")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();
  if (emailError) {
    console.error("Error resolving current staff member by email:", emailError);
    return null;
  }
  return activeOrNull(byEmail as Staff | null);
}

function activeOrNull(staff: Staff | null): Staff | null {
  if (!staff) return null;
  return staff.status === "Active" ? staff : null;
}
