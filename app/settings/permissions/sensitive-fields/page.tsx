"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { PermissionRecord, PermissionSensitiveField, SensitiveFieldKey } from "@/types/permissionCenter";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import { SENSITIVE_FIELD_LABELS } from "@/lib/permission/permissionCenter.constants";
import { SENSITIVE_FIELD_KEYS } from "@/types/permissionCenter";
import PermissionTabs from "@/components/permission/PermissionTabs";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Select from "@/components/ui/Select";

/** Sensitive Field Configuration (PERMISSION_UI.md §6) - the one editor for
 * permission_sensitive_fields (Decision 11). Not per-role - a global
 * mapping of which permission unlocks which of the 5 locked fields. */
export default function SensitiveFieldConfigPage() {
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [pairings, setPairings] = useState<PermissionSensitiveField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adding, setAdding] = useState<Record<SensitiveFieldKey, string>>({} as Record<SensitiveFieldKey, string>);

  async function load() {
    setIsLoading(true);
    const [perms, pairs] = await Promise.all([permissionApi.getCatalog(), permissionApi.getSensitiveFieldPairings()]);
    setPermissions(perms);
    setPairings(pairs);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(fieldKey: SensitiveFieldKey) {
    const permissionKey = adding[fieldKey];
    if (!permissionKey) return;
    setPairings((prev) => [...prev, { id: `${permissionKey}:${fieldKey}`, permission_key: permissionKey, field_key: fieldKey }]);
    setAdding((prev) => ({ ...prev, [fieldKey]: "" }));
    try {
      await permissionApi.toggleSensitiveField(permissionKey, fieldKey, true);
    } catch {
      await load();
    }
  }

  async function handleRemove(permissionKey: string, fieldKey: SensitiveFieldKey) {
    setPairings((prev) => prev.filter((p) => !(p.permission_key === permissionKey && p.field_key === fieldKey)));
    try {
      await permissionApi.toggleSensitiveField(permissionKey, fieldKey, false);
    } catch {
      await load();
    }
  }

  return (
    <div className="pb-8">
      <Link href="/settings/permissions" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Trường nhạy cảm</h1>
      <p className="text-muted-foreground mb-6 text-sm">Chọn quyền nào được phép xem từng trường nhạy cảm</p>

      <PermissionTabs />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SENSITIVE_FIELD_KEYS.map((fieldKey) => {
            const info = SENSITIVE_FIELD_LABELS[fieldKey];
            const paired = pairings.filter((p) => p.field_key === fieldKey);
            const pairedKeys = new Set(paired.map((p) => p.permission_key));
            const available = permissions.filter((p) => p.is_active && !pairedKeys.has(p.permission_key));

            return (
              <Card key={fieldKey}>
                <div className="mb-3">
                  <p className="font-semibold text-foreground">{info.label}</p>
                  <p className="text-xs text-muted-foreground">{info.module}</p>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[2rem]">
                  {paired.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có quyền nào mở khóa trường này</p>
                  ) : (
                    paired.map((p) => (
                      <Badge key={p.permission_key} variant="warning" className="gap-1">
                        <span className="font-mono">{p.permission_key}</span>
                        <button onClick={() => handleRemove(p.permission_key, fieldKey)} aria-label={`Gỡ ${p.permission_key}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Select
                    placeholder="Thêm quyền..."
                    value={adding[fieldKey] || ""}
                    onChange={(e) => setAdding((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                    options={available.map((p) => ({ value: p.permission_key, label: p.permission_key }))}
                    className="flex-1"
                  />
                  <button
                    onClick={() => handleAdd(fieldKey)}
                    disabled={!adding[fieldKey]}
                    className="px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
                  >
                    Thêm
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
