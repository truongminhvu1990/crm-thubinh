"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy } from "lucide-react";
import { Role, PermissionRecord, RoleDataScope, PermissionSensitiveField, DataScope, SensitiveFieldKey } from "@/types/permissionCenter";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import { SENSITIVE_FIELD_LABELS } from "@/lib/permission/permissionCenter.constants";
import PermissionChecklist from "@/components/permission/PermissionChecklist";
import DataScopeTab from "@/components/permission/DataScopeTab";
import RoleModal from "@/components/permission/RoleModal";
import ClonePermissionModal from "@/components/permission/ClonePermissionModal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

export default function RoleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [role, setRole] = useState<Role | null>(null);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [dataScopes, setDataScopes] = useState<RoleDataScope[]>([]);
  const [pairings, setPairings] = useState<PermissionSensitiveField[]>([]);
  const [tab, setTab] = useState<"permissions" | "scope">("permissions");
  const [isLoading, setIsLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Derived, not fetched - "which sensitive fields can this role see" (DB
  // §14) is computed client-side from data that already came through
  // protected endpoints (permissions catalog, this role's grants, the
  // sensitive-field pairings), rather than a separate call.
  const visibleFields = useMemo(() => {
    const grantedKeys = new Set(permissions.filter((p) => grantedIds.has(p.id)).map((p) => p.permission_key));
    const fields = new Set<SensitiveFieldKey>();
    for (const pairing of pairings) {
      if (grantedKeys.has(pairing.permission_key)) fields.add(pairing.field_key);
    }
    return fields;
  }, [permissions, grantedIds, pairings]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [roleData, roles, perms, grants, scopes, sensitivePairings] = await Promise.all([
      permissionApi.getRole(id),
      permissionApi.getRoles(),
      permissionApi.getCatalog(),
      permissionApi.getRolePermissions(),
      permissionApi.getDataScopes(),
      permissionApi.getSensitiveFieldPairings(),
    ]);
    setRole(roleData);
    setAllRoles(roles);
    setPermissions(perms);
    setGrantedIds(new Set(grants.filter((g) => g.role_id === id).map((g) => g.permission_id)));
    setDataScopes(scopes.filter((s) => s.role_id === id));
    setPairings(sensitivePairings);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTogglePermission(permissionId: string, grant: boolean) {
    setGrantedIds((prev) => {
      const next = new Set(prev);
      if (grant) next.add(permissionId);
      else next.delete(permissionId);
      return next;
    });
    try {
      await permissionApi.toggleRolePermission(id, permissionId, grant);
    } catch {
      await load();
    }
  }

  async function handleDataScopeChange(resource: string, scope: DataScope) {
    setDataScopes((prev) => {
      const next = prev.filter((s) => s.resource !== resource);
      next.push({ id: `${id}:${resource}`, role_id: id, resource, scope });
      return next;
    });
    try {
      await permissionApi.setDataScope(id, resource, scope);
    } catch {
      await load();
    }
  }

  async function handleEditSave(values: { name: string; description?: string }) {
    setIsSaving(true);
    try {
      await permissionApi.updateRole(id, values);
      setEditOpen(false);
      await load();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClone(target: { target_role_id?: string; role_key?: string; name?: string; description?: string }) {
    setIsSaving(true);
    try {
      const result = await permissionApi.cloneRolePermissions(id, target);
      setCloneOpen(false);
      if (target.target_role_id) {
        await load();
      } else {
        router.push(`/settings/permissions/roles/${result.target_role_id}`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !role) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <Link href="/settings/permissions/roles" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Vai trò
      </Link>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
            {role.name}
            <Badge variant={role.is_active ? "success" : "muted"}>{role.is_active ? "Hoạt động" : "Vô hiệu hóa"}</Badge>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm font-mono">{role.role_key}</p>
          {role.description && <p className="text-muted-foreground mt-1 text-sm">{role.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCloneOpen(true)}>
            <Copy className="w-4 h-4" />
            Sao chép quyền
          </Button>
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Chỉnh sửa
          </Button>
        </div>
      </div>

      {visibleFields.size > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium text-foreground mb-1">Trường nhạy cảm có thể xem</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(visibleFields).map((f) => (
              <Badge key={f} variant="warning">
                {SENSITIVE_FIELD_LABELS[f].label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "permissions" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("permissions")}
        >
          Quyền
        </button>
        <button
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "scope" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("scope")}
        >
          Phạm vi dữ liệu
        </button>
      </div>

      {tab === "permissions" ? (
        <PermissionChecklist permissions={permissions} grantedPermissionIds={grantedIds} onToggle={handleTogglePermission} />
      ) : (
        <DataScopeTab scopes={dataScopes} onChange={handleDataScopeChange} />
      )}

      <RoleModal
        open={editOpen}
        title="Chỉnh sửa vai trò"
        initial={role}
        lockRoleKey
        isSaving={isSaving}
        onSave={handleEditSave}
        onClose={() => setEditOpen(false)}
      />

      <ClonePermissionModal
        open={cloneOpen}
        sourceRole={role}
        otherRoles={allRoles.filter((r) => r.id !== id && r.is_active)}
        isSaving={isSaving}
        onClose={() => setCloneOpen(false)}
        onClone={handleClone}
      />
    </div>
  );
}
