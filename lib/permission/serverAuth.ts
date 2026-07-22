import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { Staff } from "@/types/staff";
import { staffHasPermission } from "./permissionCenter.service";

/** Server-side counterpart to lib/permission.ts's getCurrentStaff() - reads
 * the request's Supabase session cookies directly (same client shape as
 * lib/supabase/proxy.ts) instead of the browser client, since API Route
 * Handlers run server-side and never see the browser's client instance.
 * Required so Permission Center's own write endpoints can resolve "who is
 * calling" without trusting anything the client sends in the request body -
 * "All permission enforcement must happen server-side" (Requirements). */
/** Production Authentication Hotfix V2, Package 2 - transitional, two-
 * priority resolution (`staff.auth_user_id` added by
 * 20260730_staff_auth_user_id.sql):
 *   1. `auth_user_id` (stable, doesn't depend on `staff.email` ever
 *      matching `auth.users.email` exactly) - the fix for the confirmed
 *      Production 401 root cause.
 *   2. `email`, unchanged, for any staff row not yet linked (Package 5,
 *      Backward Compatibility - 20260730_staff_link_auth_user.sql links
 *      what it safely can, but doesn't guarantee every row).
 *   3. Neither resolves -> null, which `requirePermissionCenterAccess`
 *      below turns into 401, exactly as before.
 * This is explicitly transitional, not a redesign - once every staff row
 * is reliably linked (Package 6, future Auth-creation work), the email
 * fallback can be retired in a later, separate change. */
export async function getCurrentStaffFromRequest(request: NextRequest): Promise<Staff | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Route Handlers don't need to refresh the session cookie -
          // proxy.ts already does that for every request before this runs.
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: byAuthUserId, error: authUserIdError } = await supabase
    .from("staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (authUserIdError) {
    console.error("Error resolving current staff member by auth_user_id (server):", authUserIdError);
  }
  if (byAuthUserId) return byAuthUserId as Staff;

  if (!user.email) return null;

  const { data: byEmail, error: emailError } = await supabase
    .from("staff")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();
  if (emailError) {
    console.error("Error resolving current staff member by email (server):", emailError);
    return null;
  }
  return byEmail as Staff | null;
}

/** Gate for every Permission Center write endpoint (Package 12). Reuses the
 * pre-existing `settings.manage` permission (already Owner-only in today's
 * hardcoded ROLE_PERMISSIONS map) rather than inventing a new permission -
 * Decision 7 permits only enforcement, not new business rules. Returns the
 * authenticated staff member on success, or a ready-to-return 401/403
 * NextResponse on failure. */
export async function requirePermissionCenterAccess(
  request: NextRequest
): Promise<{ staff: Staff } | { error: NextResponse }> {
  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const allowed = await staffHasPermission(staff, "settings.manage");
  if (!allowed) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { staff };
}
