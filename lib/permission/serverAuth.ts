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
  if (!user?.email) return null;

  const { data, error } = await supabase.from("staff").select("*").eq("email", user.email).maybeSingle();
  if (error) {
    console.error("Error resolving current staff member (server):", error);
    return null;
  }
  return data as Staff | null;
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
