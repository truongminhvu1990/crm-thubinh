"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ShieldCheck, Power } from "lucide-react";
import { Role } from "@/types/permissionCenter";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import { getStaffList } from "@/lib/staff.service";
import PermissionTabs from "@/components/permission/PermissionTabs";
import RoleModal from "@/components/permission/RoleModal";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";
import SearchInput from "@/components/ui/SearchInput";

export default function RoleListPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permCounts, setPermCounts] = useState<Record<string, number>>({});
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<Role | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setIsLoading(true);
    const [roleList, grants, staff] = await Promise.all([
      permissionApi.getRoles(),
      permissionApi.getRolePermissions(),
      getStaffList(),
    ]);
    setRoles(roleList);

    const pCounts: Record<string, number> = {};
    for (const g of grants) pCounts[g.role_id] = (pCounts[g.role_id] || 0) + 1;
    setPermCounts(pCounts);

    const sCounts: Record<string, number> = {};
    for (const s of staff) if (s.role_id) sCounts[s.role_id] = (sCounts[s.role_id] || 0) + 1;
    setStaffCounts(sCounts);

    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = roles.filter(
    (r) =>
      !search.trim() ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.role_key.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(values: { role_key: string; name: string; description?: string }) {
    setIsSaving(true);
    setError("");
    try {
      if (editingRole) {
        await permissionApi.updateRole(editingRole.id, { name: values.name, description: values.description });
      } else {
        await permissionApi.createRole(values);
      }
      setModalOpen(false);
      setEditingRole(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi khi lưu vai trò");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(role: Role) {
    if (role.is_active) {
      setPendingDisable(role);
      return;
    }
    await permissionApi.setRoleActive(role.id, true);
    await load();
  }

  async function confirmDisable() {
    if (!pendingDisable) return;
    await permissionApi.setRoleActive(pendingDisable.id, false);
    setPendingDisable(null);
    await load();
  }

  return (
    <div className="pb-8">
      <div className="mb-2">
        <Link href="/settings" className="text-sm text-primary hover:text-primary/80">
          ← Cài đặt
        </Link>
      </div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Phân quyền
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{roles.length} vai trò</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditingRole(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Thêm vai trò
        </Button>
      </div>

      <PermissionTabs />

      <div className="mb-4 max-w-sm">
        <SearchInput
          placeholder="Tìm theo tên hoặc mã vai trò..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-muted-foreground text-sm">Chưa có vai trò nào</p>
        </Card>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vai trò</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mô tả</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Số quyền</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((role) => (
                <tr key={role.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/settings/permissions/roles/${role.id}`} className="font-medium text-foreground hover:text-primary">
                      {role.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">{role.role_key}</div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{role.description || "—"}</td>
                  <td className="px-5 py-3.5 text-sm">
                    {permCounts[role.id] || 0} quyền{staffCounts[role.id] ? ` · ${staffCounts[role.id]} nhân viên` : ""}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={role.is_active ? "success" : "muted"}>{role.is_active ? "Hoạt động" : "Vô hiệu hóa"}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => {
                          setEditingRole(role);
                          setModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-sm rounded-lg hover:bg-primary/10 text-primary"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleToggleActive(role)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        title={role.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
                        aria-label={role.is_active ? "Vô hiệu hóa vai trò" : "Kích hoạt vai trò"}
                      >
                        <Power className={`w-4 h-4 ${role.is_active ? "text-destructive" : "text-emerald-600"}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RoleModal
        open={modalOpen}
        title={editingRole ? "Chỉnh sửa vai trò" : "Thêm vai trò mới"}
        initial={editingRole || undefined}
        lockRoleKey={!!editingRole}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => {
          setModalOpen(false);
          setEditingRole(null);
        }}
      />
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}

      <AlertDialog
        open={!!pendingDisable}
        title="Vô hiệu hóa vai trò?"
        description={
          pendingDisable
            ? `${staffCounts[pendingDisable.id] || 0} nhân viên đang có vai trò "${pendingDisable.name}". Vô hiệu hóa không xóa liên kết này, nhưng vai trò sẽ không còn cấp quyền mới.`
            : undefined
        }
        confirmLabel="Vô hiệu hóa"
        onOpenChange={(open) => !open && setPendingDisable(null)}
        onConfirm={confirmDisable}
      />
    </div>
  );
}
