"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PermissionRecord } from "@/types/permissionCenter";

interface Props {
  permissions: PermissionRecord[];
  grantedPermissionIds: Set<string>;
  onToggle: (permissionId: string, grant: boolean) => void;
  disabled?: boolean;
}

/** Role Detail's Quyền tab (PERMISSION_UI.md §3.1) - checklist grouped by
 * resource, commit-on-toggle (no Save step). Reused as-is by the single-
 * role Permission Matrix column rendering isn't this component (the Matrix
 * is a grid, §4) - this is specifically the single-role view. */
export default function PermissionChecklist({ permissions, grantedPermissionIds, onToggle, disabled = false }: Props) {
  const groups = useMemo(() => {
    const byResource = new Map<string, PermissionRecord[]>();
    for (const p of permissions) {
      const list = byResource.get(p.resource) || [];
      list.push(p);
      byResource.set(p.resource, list);
    }
    return Array.from(byResource.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleGroup(resource: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(resource)) next.delete(resource);
      else next.add(resource);
      return next;
    });
  }

  if (permissions.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Chưa có quyền nào trong hệ thống</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map(([resource, items]) => {
        const isCollapsed = collapsed.has(resource);
        return (
          <div key={resource} className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup(resource)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 text-sm font-medium text-foreground"
            >
              <span className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {resource}
              </span>
              <span className="text-xs text-muted-foreground">{items.length} quyền</span>
            </button>
            {!isCollapsed && (
              <div className="divide-y divide-border">
                {items.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={grantedPermissionIds.has(p.id)}
                      disabled={disabled || !p.is_active}
                      onChange={(e) => onToggle(p.id, e.target.checked)}
                      className="w-4 h-4 accent-primary"
                      aria-label={`${p.permission_key}${!p.is_active ? " (vô hiệu hóa)" : ""}`}
                    />
                    <span className={`text-sm font-mono ${!p.is_active ? "text-muted-foreground/50" : "text-foreground"}`}>
                      {p.permission_key}
                    </span>
                    {p.description && <span className="text-xs text-muted-foreground">{p.description}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
