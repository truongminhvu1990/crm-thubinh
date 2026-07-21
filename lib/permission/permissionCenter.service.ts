import { supabase } from "../supabase";
import { Staff } from "@/types/staff";
import { logActivity } from "../activityLog.service";
import {
  Role,
  PermissionRecord,
  DataScope,
  DataScopeResource,
  SensitiveFieldKey,
  TeamSummary,
} from "@/types/permissionCenter";
import * as repo from "./permissionCenter.repository";
import { getCachedPermissions, setCachedPermissions, invalidatePermissionCache } from "./permissionCache";

// ============================================================
// Permission Resolution Model (DB §10) - the single algorithm every
// enforcement point (server-side API routes, Permission Center's own
// screens) uses. Deliberately separate from lib/permission.ts's existing
// synchronous hasPermission()/ROLE_PERMISSIONS, which stays untouched for
// backward compatibility (DB §20) - this is the new, DB-backed path.
// ============================================================

/** DB §10 step 2: prefer staff.role_id (a real FK) when set; otherwise
 * fall back to matching legacy staff.role text against roles.role_key
 * (Decision 10). Only active roles resolve. */
export async function resolveRoleForStaff(staff: Pick<Staff, "role" | "role_id">): Promise<Role | null> {
  if (staff.role_id) {
    const role = await repo.getRoleById(staff.role_id);
    return role && role.is_active ? role : null;
  }
  const roles = await repo.getRoles();
  const matched = roles.find((r) => r.role_key === staff.role && r.is_active);
  return matched || null;
}

/** DB §10 step 3-4: the full set of permission_key values a role currently
 * holds (active permissions only). */
export async function getGrantedPermissionKeys(roleId: string): Promise<Set<string>> {
  const [rolePermissions, permissions] = await Promise.all([repo.getRolePermissions(), repo.getPermissions()]);
  const activePermissionIds = new Set(permissions.filter((p) => p.is_active).map((p) => p.id));
  const permissionById = new Map(permissions.map((p) => [p.id, p]));

  const keys = new Set<string>();
  for (const grant of rolePermissions) {
    if (grant.role_id !== roleId || !activePermissionIds.has(grant.permission_id)) continue;
    const permission = permissionById.get(grant.permission_id);
    if (permission) keys.add(permission.permission_key);
  }
  return keys;
}

/** Resolves a staff member's full granted-permission set in one call -
 * the entry point most callers should use (§10 steps 1-4 combined, minus
 * step 1 which is the caller's own getCurrentStaff() resolution).
 * Permission Cache (Decision 21) - session-scoped (keyed by staff.id),
 * 60s TTL, invalidated on any Role/Permission write (see write operations
 * below) - this is the hot path every protected endpoint calls on every
 * request, so it's the one worth caching. */
export async function resolveStaffPermissions(staff: Pick<Staff, "id" | "role" | "role_id">): Promise<{
  role: Role | null;
  permissionKeys: Set<string>;
}> {
  const cached = getCachedPermissions(staff.id);
  if (cached) return cached;

  const role = await resolveRoleForStaff(staff);
  const result = role ? { role, permissionKeys: await getGrantedPermissionKeys(role.id) } : { role: null, permissionKeys: new Set<string>() };

  setCachedPermissions(staff.id, result.role, result.permissionKeys);
  return result;
}

export async function staffHasPermission(
  staff: Pick<Staff, "id" | "role" | "role_id">,
  permissionKey: string
): Promise<boolean> {
  const { permissionKeys } = await resolveStaffPermissions(staff);
  return permissionKeys.has(permissionKey);
}

/** Data Scope Model (DB §13): resolve which of own/team/all applies for
 * one role + one resource. No row ⇒ no defined scope (null), matching
 * DB §13's "no row ⇒ no defined scope" statement - callers decide the
 * default-deny/default-allow behavior for that case themselves. */
export async function getResolvedDataScope(roleId: string, resource: DataScopeResource): Promise<DataScope | null> {
  const scopes = await repo.getRoleDataScopes();
  const match = scopes.find((s) => s.role_id === roleId && s.resource === resource);
  return match?.scope ?? null;
}

/** Field Visibility Model (DB §14): which of the 5 sensitive fields a
 * role's currently-granted permissions unlock - role's granted permissions
 * ∩ permission_sensitive_fields.permission_key → resulting field_key set. */
export async function getVisibleSensitiveFields(roleId: string): Promise<Set<SensitiveFieldKey>> {
  const [permissionKeys, pairings] = await Promise.all([
    getGrantedPermissionKeys(roleId),
    repo.getSensitiveFieldPairings(),
  ]);
  const fields = new Set<SensitiveFieldKey>();
  for (const pairing of pairings) {
    if (permissionKeys.has(pairing.permission_key)) fields.add(pairing.field_key);
  }
  return fields;
}

// ============================================================
// Write operations - each wraps a repository write with the Audit
// Integration requirement (Decision 8, DB §16): every Role/Permission/Data
// Scope change is recorded via the existing activity_logs/logActivity().
// ============================================================

export class PermissionServiceError extends Error {}

export async function createRole(actorStaffId: string, input: { role_key: string; name: string; description?: string }) {
  const { data, error } = await repo.insertRole(input);
  if (error || !data) throw new PermissionServiceError(error?.message || "Error creating role");
  await logActivity({ staff_id: actorStaffId, action: "role_created", entity: "role", entity_id: data.id });
  invalidatePermissionCache();
  return data;
}

export async function updateRole(
  actorStaffId: string,
  roleId: string,
  fields: Partial<Pick<Role, "name" | "description">>
) {
  const { data, error } = await repo.updateRoleRow(roleId, fields);
  if (error || !data) throw new PermissionServiceError(error?.message || "Error updating role");
  await logActivity({ staff_id: actorStaffId, action: "role_updated", entity: "role", entity_id: roleId });
  invalidatePermissionCache();
  return data;
}

export async function setRoleActive(actorStaffId: string, roleId: string, isActive: boolean) {
  const { data, error } = await repo.updateRoleRow(roleId, { is_active: isActive });
  if (error || !data) throw new PermissionServiceError(error?.message || "Error updating role status");
  await logActivity({
    staff_id: actorStaffId,
    action: isActive ? "role_enabled" : "role_disabled",
    entity: "role",
    entity_id: roleId,
  });
  invalidatePermissionCache();
  return data;
}

export async function toggleRolePermission(
  actorStaffId: string,
  roleId: string,
  permissionId: string,
  grant: boolean
) {
  const { error } = grant ? await repo.grantPermission(roleId, permissionId) : await repo.revokePermission(roleId, permissionId);
  if (error) throw new PermissionServiceError(error.message);
  await logActivity({
    staff_id: actorStaffId,
    action: grant ? "permission_granted" : "permission_revoked",
    entity: "role_permission",
    entity_id: `${roleId}:${permissionId}`,
  });
  invalidatePermissionCache();
}

/** Clone Permission (Decision 14, UI §3.3) - scoped to role_permissions
 * only, per the action's literal name. Data Scope and Sensitive Field
 * visibility are not separately copied. */
export async function cloneRolePermissions(actorStaffId: string, sourceRoleId: string, targetRoleId: string) {
  const clonedCount = await repo.clonePermissions(sourceRoleId, targetRoleId);
  await logActivity({
    staff_id: actorStaffId,
    action: "permissions_cloned",
    entity: "role_permission",
    entity_id: `${sourceRoleId}->${targetRoleId}`,
  });
  invalidatePermissionCache();
  return clonedCount;
}

export async function setDataScope(actorStaffId: string, roleId: string, resource: DataScopeResource, scope: DataScope) {
  const { error } = await repo.setRoleDataScope(roleId, resource, scope);
  if (error) throw new PermissionServiceError(error.message);
  await logActivity({
    staff_id: actorStaffId,
    action: "data_scope_changed",
    entity: "role_data_scope",
    entity_id: `${roleId}:${resource}`,
  });
}

export async function toggleSensitiveFieldPairing(
  actorStaffId: string,
  permissionKey: string,
  fieldKey: SensitiveFieldKey,
  pair: boolean
) {
  const { error } = pair
    ? await repo.pairSensitiveField(permissionKey, fieldKey)
    : await repo.unpairSensitiveField(permissionKey, fieldKey);
  if (error) throw new PermissionServiceError(error.message);
  await logActivity({
    staff_id: actorStaffId,
    action: pair ? "sensitive_field_paired" : "sensitive_field_unpaired",
    entity: "permission",
    entity_id: `${permissionKey}:${fieldKey}`,
  });
}

export async function renameTeam(actorStaffId: string, oldTeamId: string, newTeamId: string) {
  const { error, count } = await repo.renameTeamForAllMembers(oldTeamId, newTeamId);
  if (error) throw new PermissionServiceError(error.message);
  await logActivity({ staff_id: actorStaffId, action: "team_renamed", entity: "role_data_scope", entity_id: newTeamId });
  return count;
}

export async function assignTeam(actorStaffId: string, staffIds: string[], teamId: string | null) {
  const { error } = await repo.assignStaffTeam(staffIds, teamId);
  if (error) throw new PermissionServiceError(error.message);
  await logActivity({
    staff_id: actorStaffId,
    action: teamId ? "team_assigned" : "team_removed",
    entity: "role_data_scope",
    entity_id: teamId ?? "unassigned",
  });
}

/** User Role Assignment (Decision 10, UI §8). */
export async function assignStaffRoleAndTeam(
  actorStaffId: string,
  staffId: string,
  fields: { role_id?: string | null; team_id?: string | null }
) {
  const { data, error } = await repo.updateStaffRoleAssignment(staffId, fields);
  if (error || !data) throw new PermissionServiceError(error?.message || "Error assigning role/team");
  if (fields.role_id !== undefined) {
    await logActivity({ staff_id: actorStaffId, action: "staff_role_assigned", entity: "role", entity_id: fields.role_id });
  }
  if (fields.team_id !== undefined) {
    await logActivity({
      staff_id: actorStaffId,
      action: "staff_team_assigned",
      entity: "role_data_scope",
      entity_id: fields.team_id ?? "unassigned",
    });
  }
  return data;
}

// ============================================================
// Permission Dashboard (Decision 16, UI §18) - 5 KPIs, simple aggregates.
// ============================================================

export interface PermissionDashboardKpis {
  totalRoles: number;
  totalPermissions: number;
  assignedUsers: number;
  totalStaff: number;
  totalTeams: number;
  permissionChanges30Days: number;
}

const AUDITED_ENTITIES = ["role", "permission", "role_permission", "role_data_scope"];

export async function getPermissionDashboardKpis(): Promise<PermissionDashboardKpis> {
  const [rolesRes, permissionsRes, staffRes, changesRes] = await Promise.all([
    supabase.from("roles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("permissions").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("staff").select("id, role_id, team_id"),
    supabase
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .in("entity", AUDITED_ENTITIES)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const staffRows = (staffRes.data as { id: string; role_id: string | null; team_id: string | null }[]) || [];
  const totalTeams = new Set(staffRows.filter((s) => s.team_id).map((s) => s.team_id)).size;
  const assignedUsers = staffRows.filter((s) => s.role_id).length;

  return {
    totalRoles: rolesRes.count ?? 0,
    totalPermissions: permissionsRes.count ?? 0,
    assignedUsers,
    totalStaff: staffRows.length,
    totalTeams,
    permissionChanges30Days: changesRes.count ?? 0,
  };
}

// ============================================================
// Team Management (Decision 13) - re-exported repository reads, no
// business logic beyond what's already in the repository.
// ============================================================

export async function getTeams(): Promise<TeamSummary[]> {
  return repo.getStaffTeams();
}

export { getRoles, getRoleById, getPermissions } from "./permissionCenter.repository";
export type { PermissionRecord };
