"use client";

import { useEffect, useState } from "react";
import { getCurrentStaff } from "@/lib/permission";
import { resolveMyDataScope, resolveMyActivityLogScope } from "@/lib/permission/dataScope";
import { resolvePurchaseHistoryVisibility, PurchaseHistoryVisibility } from "@/lib/permission/purchaseHistoryVisibility";
import { DataScope, DataScopeResource } from "@/types/permissionCenter";
import Badge from "@/components/ui/Badge";

type IndicatorScope = DataScope | PurchaseHistoryVisibility;

const SCOPE_LABEL: Record<IndicatorScope, string> = {
  own: "Của tôi",
  team: "Nhóm",
  all: "Tất cả",
  hidden: "Ẩn",
};

interface Props {
  /** One of Permission Center's 8 named resources, "activity_log" - locked
   * per-role (Decision 39) rather than role_data_scopes-configurable - or
   * "purchase_history" - Customer Visibility Engine's own fixed mapping
   * (Package 4B, lib/permission/purchaseHistoryVisibility.ts), also not
   * role_data_scopes-configurable. All three resolve via their own function
   * but render with this same badge. */
  resource: DataScopeResource | "activity_log" | "purchase_history";
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
  const [scope, setScope] = useState<IndicatorScope | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const staff = await getCurrentStaff();
      if (!staff) return;
      const resolved =
        resource === "activity_log"
          ? await resolveMyActivityLogScope(staff)
          : resource === "purchase_history"
          ? await resolvePurchaseHistoryVisibility(staff)
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
