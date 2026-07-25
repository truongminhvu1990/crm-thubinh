export type StaffRole = "Owner" | "Manager" | "Sales" | "Marketing" | "Viewer";
/** Staff Identity & Authentication Foundation, Required Change 1 - widened
 * from Active/Inactive. Staff rows are never deleted (Business Rule 6);
 * "Archived" is the terminal status a staff member moves to instead of
 * deletion (lib/staff.service.ts archiveStaff()). "Locked" is available for
 * future use (e.g. a future Reset Password/security flow) - nothing in
 * this package sets it yet. */
export type StaffStatus = "Active" | "Inactive" | "Locked" | "Archived";

export interface Staff {
  id: string;
  staff_code: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  role: StaffRole;
  status: StaffStatus;
  joined_date?: string | null;
  avatar?: string | null;
  note?: string | null;
  /** Enterprise Permission Center (Sprint v4.0.0), Decision 9 - flat team
   * grouping, plain value, no backing table. "Same team" = same team_id. */
  team_id?: string | null;
  /** Enterprise Permission Center (Sprint v4.0.0), Decision 10 - forward-
   * looking pointer to the dynamic role model, alongside legacy `role`
   * above (kept untouched). Prefer this when set; fall back to `role`
   * otherwise (lib/permission/permissionCenter.service.ts resolveRoleForStaff). */
  role_id?: string | null;
  /** Production Authentication Hotfix V2, Package 1 - links this row to its
   * auth.users account. Preferred over `email` when set
   * (lib/permission/serverAuth.ts getCurrentStaffFromRequest); may be null
   * for rows not yet linked (Package 5, Backward Compatibility). */
  auth_user_id?: string | null;
  /** Staff Identity & Authentication Foundation, Required Change 3/4 -
   * authentication lifecycle foundation (DB columns only; no login flow
   * reads/writes these yet). `last_login_at` NULL means "never logged in" -
   * deliberately no separate boolean for that state. `must_change_password`
   * is set true by lib/auth/createStaffWithAuth.ts at account creation
   * (Business Rule 4/5's temporary password) and would be cleared by a
   * future password-change flow, not by anything in this package. */
  last_login_at?: string | null;
  password_changed_at?: string | null;
  must_change_password?: boolean;
  created_at?: string;
  updated_at?: string;
}
