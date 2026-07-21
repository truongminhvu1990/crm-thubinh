// Thin client-side wrapper around every Permission Center endpoint - reads
// and writes alike (Decision 19: GET endpoints are protected too, so reads
// go through this same fetch-based client, never a direct client-side
// Supabase call for Permission Center's own tables).

import {
  Role,
  PermissionRecord,
  RolePermission,
  RoleDataScope,
  PermissionSensitiveField,
  TeamSummary,
} from "@/types/permissionCenter";
import { Staff } from "@/types/staff";
import { ActivityLog } from "@/types/activityLog";
import { PermissionDashboardKpis } from "./permissionCenter.service";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Yêu cầu thất bại (${res.status})`);
  }
  return json as T;
}

async function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Yêu cầu thất bại (${res.status})`);
  }
  return json as T;
}

export const permissionApi = {
  getRoles: () => getJson<Role[]>("/api/permissions/roles"),
  getRole: (id: string) => getJson<Role>(`/api/permissions/roles/${id}`),
  getCatalog: () => getJson<PermissionRecord[]>("/api/permissions/catalog"),
  getRolePermissions: () => getJson<RolePermission[]>("/api/permissions/role-permissions"),
  getDataScopes: () => getJson<RoleDataScope[]>("/api/permissions/data-scopes"),
  getSensitiveFieldPairings: () => getJson<PermissionSensitiveField[]>("/api/permissions/sensitive-fields"),
  getTeams: () => getJson<TeamSummary[]>("/api/permissions/teams"),
  getDashboardKpis: () => getJson<PermissionDashboardKpis>("/api/permissions/dashboard"),
  getAuditLogs: (params: { entity?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.entity) qs.set("entity", params.entity);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const query = qs.toString();
    return getJson<ActivityLog[]>(`/api/permissions/audit${query ? `?${query}` : ""}`);
  },

  createRole: (input: { role_key: string; name: string; description?: string }) =>
    postJson<Role>("/api/permissions/roles", input),

  updateRole: (id: string, fields: { name?: string; description?: string }) =>
    postJson<Role>(`/api/permissions/roles/${id}`, fields, "PATCH"),

  setRoleActive: (id: string, is_active: boolean) =>
    postJson<Role>(`/api/permissions/roles/${id}`, { is_active }, "PATCH"),

  cloneRolePermissions: (
    sourceRoleId: string,
    target: { target_role_id?: string; role_key?: string; name?: string; description?: string }
  ) => postJson<{ target_role_id: string; cloned_count: number }>(`/api/permissions/roles/${sourceRoleId}/clone`, target),

  toggleRolePermission: (role_id: string, permission_id: string, grant: boolean) =>
    postJson<{ ok: true }>("/api/permissions/role-permissions", { role_id, permission_id, grant }),

  setDataScope: (role_id: string, resource: string, scope: string) =>
    postJson<{ ok: true }>("/api/permissions/data-scopes", { role_id, resource, scope }),

  toggleSensitiveField: (permission_key: string, field_key: string, pair: boolean) =>
    postJson<{ ok: true }>("/api/permissions/sensitive-fields", { permission_key, field_key, pair }),

  renameTeam: (old_team_id: string, new_team_id: string) =>
    postJson<{ renamed_count: number }>("/api/permissions/teams/rename", { old_team_id, new_team_id }),

  assignTeam: (staff_ids: string[], team_id: string | null, is_new_team = false) =>
    postJson<{ ok: true }>("/api/permissions/teams/assign", { staff_ids, team_id, is_new_team }),

  assignStaffPermission: (staffId: string, fields: { role_id?: string | null; team_id?: string | null }) =>
    postJson<Staff>(`/api/staff/${staffId}/permission-assignment`, fields, "PATCH"),
};
