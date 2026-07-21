import { supabase } from "./supabase";
import { Staff, StaffRole } from "@/types/staff";
import { Permission, ROLE_PERMISSIONS } from "@/types/permission";

export function hasPermission(role: StaffRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Maps the signed-in Supabase Auth user to a `staff` row by email. Returns
 * null if unauthenticated or if no staff record exists for that email yet
 * (e.g. an auth account created before this module, or a login not tied to
 * any staff member) - callers should treat null the same as "no
 * permissions", not throw. */
export async function getCurrentStaff(): Promise<Staff | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data, error } = await supabase.from("staff").select("*").eq("email", user.email).maybeSingle();

  if (error) {
    console.error("Error resolving current staff member:", error);
    return null;
  }
  return data as Staff | null;
}
