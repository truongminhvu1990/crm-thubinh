import { supabase } from "../supabase";
import { Staff } from "@/types/staff";
import {
  Role,
  PermissionRecord,
  RolePermission,
  RoleDataScope,
  PermissionSensitiveField,
  DataScope,
  SensitiveFieldKey,
  TeamSummary,
} from "@/types/permissionCenter";

// ============================================================
// roles
// ============================================================

export async function getRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from("roles").select("*").order("name", { ascending: true });
  if (error) {
    console.error("Error fetching roles:", error);
    return [];
  }
  return data as Role[];
}

export async function getRoleById(id: string): Promise<Role | null> {
  const { data, error } = await supabase.from("roles").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching role:", error);
    return null;
  }
  return data as Role | null;
}

export async function insertRole(role: { role_key: string; name: string; description?: string }) {
  const { data, error } = await supabase.from("roles").insert(role).select().single();
  if (error) return { data: null, error };
  return { data: data as Role, error: null };
}

export async function updateRoleRow(id: string, fields: Partial<Pick<Role, "name" | "description" | "is_active">>) {
  const { data, error } = await supabase.from("roles").update(fields).eq("id", id).select().single();
  if (error) return { data: null, error };
  return { data: data as Role, error: null };
}

// ============================================================
// permissions
// ============================================================

export async function getPermissions(): Promise<PermissionRecord[]> {
  const { data, error } = await supabase.from("permissions").select("*").order("resource", { ascending: true });
  if (error) {
    console.error("Error fetching permissions:", error);
    return [];
  }
  return data as PermissionRecord[];
}

// ============================================================
// role_permissions
// ============================================================

export async function getRolePermissions(): Promise<RolePermission[]> {
  const { data, error } = await supabase.from("role_permissions").select("*");
  if (error) {
    console.error("Error fetching role_permissions:", error);
    return [];
  }
  return data as RolePermission[];
}

export async function grantPermission(roleId: string, permissionId: string) {
  const { error } = await supabase
    .from("role_permissions")
    .insert({ role_id: roleId, permission_id: permissionId });
  // 23505 = already granted (unique violation) - treat as success, idempotent.
  if (error && (error as { code?: string }).code !== "23505") return { error };
  return { error: null };
}

export async function revokePermission(roleId: string, permissionId: string) {
  const { error } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId)
    .eq("permission_id", permissionId);
  return { error };
}

/** Clone Permission (Decision 14) - copies every permission grant from
 * sourceRoleId onto targetRoleId, skipping ones the target already has. */
export async function clonePermissions(sourceRoleId: string, targetRoleId: string): Promise<number> {
  const { data: sourceGrants, error: sourceError } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", sourceRoleId);
  if (sourceError || !sourceGrants) {
    console.error("Error reading source role's permissions:", sourceError);
    return 0;
  }

  const { data: targetGrants } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", targetRoleId);
  const alreadyGranted = new Set((targetGrants || []).map((g) => g.permission_id as string));

  const toInsert = sourceGrants
    .map((g) => g.permission_id as string)
    .filter((permissionId) => !alreadyGranted.has(permissionId))
    .map((permissionId) => ({ role_id: targetRoleId, permission_id: permissionId }));

  if (toInsert.length === 0) return 0;

  const { error } = await supabase.from("role_permissions").insert(toInsert);
  if (error) {
    console.error("Error cloning permissions:", error);
    return 0;
  }
  return toInsert.length;
}

// ============================================================
// role_data_scopes
// ============================================================

export async function getRoleDataScopes(): Promise<RoleDataScope[]> {
  const { data, error } = await supabase.from("role_data_scopes").select("*");
  if (error) {
    console.error("Error fetching role_data_scopes:", error);
    return [];
  }
  return data as RoleDataScope[];
}

/** Upsert on (role_id, resource) - "selecting any option creates the row" (UI §3.2). */
export async function setRoleDataScope(roleId: string, resource: string, scope: DataScope) {
  const { error } = await supabase
    .from("role_data_scopes")
    .upsert({ role_id: roleId, resource, scope }, { onConflict: "role_id,resource" });
  return { error };
}

// ============================================================
// permission_sensitive_fields
// ============================================================

export async function getSensitiveFieldPairings(): Promise<PermissionSensitiveField[]> {
  const { data, error } = await supabase.from("permission_sensitive_fields").select("*");
  if (error) {
    console.error("Error fetching permission_sensitive_fields:", error);
    return [];
  }
  return data as PermissionSensitiveField[];
}

export async function pairSensitiveField(permissionKey: string, fieldKey: SensitiveFieldKey) {
  const { error } = await supabase
    .from("permission_sensitive_fields")
    .insert({ permission_key: permissionKey, field_key: fieldKey });
  if (error && (error as { code?: string }).code !== "23505") return { error };
  return { error: null };
}

export async function unpairSensitiveField(permissionKey: string, fieldKey: SensitiveFieldKey) {
  const { error } = await supabase
    .from("permission_sensitive_fields")
    .delete()
    .eq("permission_key", permissionKey)
    .eq("field_key", fieldKey);
  return { error };
}

// ============================================================
// staff.team_id / staff.role_id (Decision 9, Decision 10)
// ============================================================

export async function getStaffTeams(): Promise<TeamSummary[]> {
  const { data, error } = await supabase.from("staff").select("team_id").not("team_id", "is", null);
  if (error) {
    console.error("Error fetching staff teams:", error);
    return [];
  }
  const counts = new Map<string, number>();
  for (const row of data as { team_id: string }[]) {
    counts.set(row.team_id, (counts.get(row.team_id) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([team_id, member_count]) => ({ team_id, member_count }))
    .sort((a, b) => a.team_id.localeCompare(b.team_id));
}

export async function getStaffByTeam(teamId: string): Promise<Staff[]> {
  const { data, error } = await supabase.from("staff").select("*").eq("team_id", teamId);
  if (error) {
    console.error("Error fetching staff by team:", error);
    return [];
  }
  return data as Staff[];
}

/** Every staff row, unconditionally (no active/inactive filter) - mirrors
 * getStaffByTeam's own no-status-filter convention. Used by Data Scope's
 * Decision 44 "unresolved ownership" check (dataScope.ts), which needs the
 * full set of current staff names to test whether a text ownership field
 * matches *any* of them, not just a specific team. */
export async function getAllStaff(): Promise<Staff[]> {
  const { data, error } = await supabase.from("staff").select("*");
  if (error) {
    console.error("Error fetching all staff:", error);
    return [];
  }
  return data as Staff[];
}

export async function getUnassignedStaff(): Promise<Staff[]> {
  const { data, error } = await supabase.from("staff").select("*").is("team_id", null);
  if (error) {
    console.error("Error fetching unassigned staff:", error);
    return [];
  }
  return data as Staff[];
}

/** Team Management's "Rename Team" (§7) - bulk UPDATE of every staff row
 * currently holding the old team_id value. */
export async function renameTeamForAllMembers(oldTeamId: string, newTeamId: string) {
  const { data, error } = await supabase
    .from("staff")
    .update({ team_id: newTeamId })
    .eq("team_id", oldTeamId)
    .select("id");
  return { error, count: data?.length ?? 0 };
}

export async function assignStaffTeam(staffIds: string[], teamId: string | null) {
  const { error } = await supabase.from("staff").update({ team_id: teamId }).in("id", staffIds);
  return { error };
}

export async function updateStaffRoleAssignment(staffId: string, fields: { role_id?: string | null; team_id?: string | null }) {
  const { data, error } = await supabase.from("staff").update(fields).eq("id", staffId).select().single();
  if (error) return { data: null, error };
  return { data: data as Staff, error: null };
}
