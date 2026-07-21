export type StaffRole = "Owner" | "Manager" | "Sales" | "Marketing" | "Viewer";
export type StaffStatus = "Active" | "Inactive";

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
  created_at?: string;
  updated_at?: string;
}
