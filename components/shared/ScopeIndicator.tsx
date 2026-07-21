"use client";

import { useEffect, useState } from "react";
import { getCurrentStaff } from "@/lib/permission";
import { resolveMyDataScope, resolveMyActivityLogScope } from "@/lib/permission/dataScope";
import { DataScope, DataScopeResource } from "@/types/permissionCenter";
import Badge from "@/components/ui/Badge";

const SCOPE_LABEL: Record<DataScope, string> = {
  own: "Của tôi",
  team: "Nhóm",
  all: "Tất cả",
};

interface Props {
  /** One of Permission Center's 8 named resources, or "activity_log" -
   * locked per-role (Decision 39) rather than role_data_scopes-configurable,
   * so it's resolved via a separate function but shown with this same badge
   * (DATA_SCOPE_ROLLOUT_UI.md §1, §9). */
  resource: DataScopeResource | "activity_log";
  className?: string;
}

/**
 * The one UI element the Data Scope Rollout introduces (DATA_SCOPE_ROLLOUT_UI.md
 * §1) - a small, read-only, always-shown badge stating the signed-in staff
 * member's resolved Own/Team/All scope for one resource. Renders nothing
 * while resolving/if no staff or no configured scope is found, rather than a
 * placeholder - there is no locked copy for "unknown," and every screen this
 * is used on already tolerates a brief absence during initial load.
 */
export default function ScopeIndicator({ resource, className }: Props) {
  const [scope, setScope] = useState<DataScope | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const staff = await getCurrentStaff();
      if (!staff) return;
      const resolved =
        resource === "activity_log"
          ? await resolveMyActivityLogScope(staff)
          : await resolveMyDataScope(staff, resource);
      if (!cancelled) setScope(resolved);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [resource]);

  if (!scope) return null;

  return (
    <Badge variant="muted" className={className}>
      {SCOPE_LABEL[scope]}
    </Badge>
  );
}
