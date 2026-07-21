"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Role, PermissionRecord, RolePermission } from "@/types/permissionCenter";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import PermissionTabs from "@/components/permission/PermissionTabs";
import SearchInput from "@/components/ui/SearchInput";
import Card from "@/components/ui/Card";

/** Permission Matrix (PERMISSION_UI.md §4) - Roles as columns, Permissions
 * as rows grouped by resource, each cell a toggle over the exact same
 * role_permissions data Role Detail's Quyền tab (§3.1) reads/writes -
 * changing a cell here is immediately visible there and vice versa. */
export default function PermissionMatrixPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [grants, setGrants] = useState<RolePermission[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  async function load() {
    setIsLoading(true);
    const [r, p, g] = await Promise.all([permissionApi.getRoles(), permissionApi.getCatalog(), permissionApi.getRolePermissions()]);
    setRoles(r);
    setPermissions(p);
    setGrants(g);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const grantSet = useMemo(() => new Set(grants.map((g) => `${g.role_id}:${g.permission_id}`)), [grants]);

  const groups = useMemo(() => {
    const filtered = permissions.filter(
      (p) =>
        !search.trim() ||
        p.permission_key.toLowerCase().includes(search.toLowerCase()) ||
        p.resource.toLowerCase().includes(search.toLowerCase())
    );
    const byResource = new Map<string, PermissionRecord[]>();
    for (const p of filtered) {
      const list = byResource.get(p.resource) || [];
      list.push(p);
      byResource.set(p.resource, list);
    }
    return Array.from(byResource.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions, search]);

  async function handleCellToggle(role: Role, permission: PermissionRecord, grant: boolean) {
    const key = `${role.id}:${permission.id}`;
    setPending((prev) => new Set(prev).add(key));
    setGrants((prev) =>
      grant
        ? [...prev, { id: key, role_id: role.id, permission_id: permission.id }]
        : prev.filter((g) => !(g.role_id === role.id && g.permission_id === permission.id))
    );
    try {
      await permissionApi.toggleRolePermission(role.id, permission.id, grant);
    } catch {
      await load();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="pb-8">
      <Link href="/settings/permissions" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Ma trận quyền</h1>
      <p className="text-muted-foreground mb-6 text-sm">Cấp/thu hồi quyền cho nhiều vai trò cùng lúc</p>

      <PermissionTabs />

      <div className="mb-4 max-w-sm">
        <SearchInput placeholder="Tìm theo tên quyền..." value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : groups.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-muted-foreground text-sm">Không tìm thấy quyền phù hợp</p>
        </Card>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-card px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide z-10">
                  Quyền
                </th>
                {roles.map((role) => (
                  <th key={role.id} className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${role.is_active ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([resource, items]) => (
                <Fragment key={resource}>
                  <tr className="bg-muted/30">
                    <td colSpan={roles.length + 1} className="sticky left-0 bg-muted/30 px-4 py-1.5 text-xs font-semibold text-foreground">
                      {resource}
                    </td>
                  </tr>
                  {items.map((permission) => (
                    <tr key={permission.id} className="border-b border-border last:border-0">
                      <td className={`sticky left-0 bg-card px-4 py-2 text-sm font-mono whitespace-nowrap ${!permission.is_active ? "text-muted-foreground/40" : "text-foreground"}`}>
                        {permission.permission_key}
                      </td>
                      {roles.map((role) => {
                        const key = `${role.id}:${permission.id}`;
                        const granted = grantSet.has(key);
                        const disabled = pending.has(key) || !role.is_active || !permission.is_active;
                        return (
                          <td key={role.id} className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={granted}
                              disabled={disabled}
                              onChange={(e) => handleCellToggle(role, permission, e.target.checked)}
                              className="w-4 h-4 accent-primary"
                              aria-label={`${role.name} — ${permission.permission_key}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
