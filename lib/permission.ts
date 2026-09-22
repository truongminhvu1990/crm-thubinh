import { supabase } from "./supabase";
import { Staff, StaffRole } from "@/types/staff";
import { Permission, ROLE_PERMISSIONS } from "@/types/permission";
import { resolveStaffFromAuthUser } from "./permission/staffIdentity";

export function hasPermission(role: StaffRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Maps the signed-in Supabase Auth user to a `staff` row - `auth_user_id`
 * first, `email` fallback (authorization identity-resolution hardening,
 * 2026-09-21; see `lib/permission/staffIdentity.ts` for the shared
 * resolution order, now identical to the server-side
 * `getCurrentStaffFromRequest()` - previously this function only matched
 * by `email`). Returns null if unauthenticated or if no staff record
 * resolves - callers should treat null the same as "no permissions", not
 * throw. */
export async function getCurrentStaff(): Promise<Staff | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return resolveStaffFromAuthUser(supabase, user);
}
