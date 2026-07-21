"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Role, RoleDataScope } from "@/types/permissionCenter";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import { DATA_SCOPE_RESOURCE_OPTIONS, DATA_SCOPE_OPTIONS } from "@/lib/permission/permissionCenter.constants";
import PermissionTabs from "@/components/permission/PermissionTabs";
import Badge from "@/components/ui/Badge";

const SCOPE_BADGE_VARIANT: Record<string, "muted" | "default" | "secondary" | "success"> = {
  own: "default",
  team: "secondary",
  all: "success",
};

/** Data Scope Matrix (Decision 15, PERMISSION_UI.md §5.1) - read-only,
 * cross-role Own/Team/All view. Every cell deep-links to the editable
 * Role Detail Data Scope tab (§3.2) - nothing here writes anything. */
export default function DataScopeMatrixPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [scopes, setScopes] = useState<RoleDataScope[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([permissionApi.getRoles(), permissionApi.getDataScopes()]).then(([r, s]) => {
      setRoles(r);
      setScopes(s);
      setIsLoading(false);
    });
  }, []);

  const scopeByKey = useMemo(() => new Map(scopes.map((s) => [`${s.role_id}:${s.resource}`, s.scope])), [scopes]);

  return (
    <div className="pb-8">
      <Link href="/settings/permissions" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Ma trận phạm vi dữ liệu</h1>
      <p className="text-muted-foreground mb-6 text-sm">Chỉ xem — chỉnh sửa tại trang Chi tiết vai trò</p>

      <PermissionTabs />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-card px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Nguồn dữ liệu
                </th>
                {roles.map((role) => (
                  <th key={role.id} className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DATA_SCOPE_RESOURCE_OPTIONS.map(({ value: resource, label }) => (
                <tr key={resource} className="border-b border-border last:border-0">
                  <td className="sticky left-0 bg-card px-4 py-2.5 text-sm font-medium text-foreground whitespace-nowrap">{label}</td>
                  {roles.map((role) => {
                    const scope = scopeByKey.get(`${role.id}:${resource}`);
                    return (
                      <td key={role.id} className="px-4 py-2.5 text-center">
                        {scope ? (
                          <Link href={`/settings/permissions/roles/${role.id}`}>
                            <Badge variant={SCOPE_BADGE_VARIANT[scope]}>{DATA_SCOPE_OPTIONS.find((o) => o.value === scope)?.label}</Badge>
                          </Link>
                        ) : (
                          <Link href={`/settings/permissions/roles/${role.id}`} className="text-muted-foreground/50">
                            —
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
