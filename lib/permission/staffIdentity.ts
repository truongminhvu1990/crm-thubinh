import { SupabaseClient } from "@supabase/supabase-js";
import { Staff } from "@/types/staff";

/** Shared staff-identity resolution (Production Authorization Incident
 * follow-up, 2026-09-21) - the single algorithm both the browser-side
 * `lib/permission.ts#getCurrentStaff()` and the server-side
 * `lib/permission/serverAuth.ts#getCurrentStaffFromRequest()` now call,
 * replacing two independently-maintained implementations that had drifted:
 * the browser path only ever matched by `email`, with no `auth_user_id`
 * fallback, unlike the server path. This is authorization identity-
 * resolution hardening that closes that confirmed divergence - it is
 * NOT presented as a fix for the original Production incident, whose root
 * cause remains UNCONFIRMED (the one Production staff row known to have a
 * broken identity link has no corresponding `auth.users` account at all,
 * so it cannot be the session that reported the incident).
 *
 * Resolution order - unchanged from the pre-existing server-side priority
 * ("Production Authentication Hotfix V2, Package 2"), now also applied to
 * the browser path:
 *   1. `staff.auth_user_id` (stable FK, doesn't depend on email matching)
 *   2. `staff.email` (transitional fallback for any row not yet linked)
 *   3. Neither resolves -> null
 * Deliberately does NOT filter on `staff.status` - preserves the existing
 * pre-change behavior (an Inactive/Locked/Archived staff row with a
 * matching `auth_user_id` or `email` still resolves here, exactly as
 * both prior implementations already did). Whether Locked/Archived staff
 * should be rejected is a real, separately-tracked question (Rule A/B,
 * `docs/PERMISSION_CENTER_INVESTIGATION_V2.md`), but implementing it here
 * would be a new, unreviewed authorization-policy change bundled into an
 * unrelated fix - out of scope for this change by explicit instruction. */
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
  if (byAuthUserId) return byAuthUserId as Staff;

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
  return byEmail as Staff | null;
}
