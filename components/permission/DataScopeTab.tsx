"use client";

import { cn } from "@/lib/utils";
import { DataScope, RoleDataScope } from "@/types/permissionCenter";
import { DATA_SCOPE_RESOURCE_OPTIONS, DATA_SCOPE_OPTIONS } from "@/lib/permission/permissionCenter.constants";

interface Props {
  scopes: RoleDataScope[];
  onChange: (resource: string, scope: DataScope) => void;
  disabled?: boolean;
}

/** Role Detail's Phạm vi dữ liệu tab (PERMISSION_UI.md §3.2/§5) - one 3-way
 * segmented control per named resource. Orders is shown disabled - no
 * ownership field yet (DB §13), BLOCKED project-wide. */
export default function DataScopeTab({ scopes, onChange, disabled = false }: Props) {
  const scopeByResource = new Map(scopes.map((s) => [s.resource, s.scope]));

  return (
    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
      {DATA_SCOPE_RESOURCE_OPTIONS.map(({ value: resource, label }) => {
        const isOrders = resource === "orders";
        const current = scopeByResource.get(resource) || null;
        return (
          <div key={resource} className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
            <span className={cn("text-sm font-medium", isOrders && "text-muted-foreground")}>
              {label}
              {isOrders && <span className="ml-2 text-xs font-normal text-muted-foreground">(Orders chưa triển khai)</span>}
            </span>
            <div className="inline-flex rounded-lg border border-border overflow-hidden" role="radiogroup" aria-label={`Phạm vi dữ liệu - ${label}`}>
              {DATA_SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={current === opt.value}
                  disabled={disabled || isOrders}
                  onClick={() => onChange(resource, opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    current === opt.value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50 text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
