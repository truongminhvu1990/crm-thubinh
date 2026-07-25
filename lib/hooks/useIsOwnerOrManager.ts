"use client";

import { useEffect, useState } from "react";
import { getCurrentStaff } from "@/lib/permission";
import { resolveRoleForStaff } from "@/lib/permission/permissionCenter.service";

/** Simple Profit Calculation Package - the one role check every part of this
 * package reuses to decide whether Cost/Profit is shown. Deliberately not a
 * new permission engine: no new table, no new permission_key, no config UI -
 * just resolveRoleForStaff() (already existing) checked against the two
 * role_key values that should see Cost/Profit, same "fixed mapping" pattern
 * already used elsewhere in this codebase (e.g.
 * app/api/orders/_authorization.ts's ORDERS_WRITE_SCOPE_BY_ROLE_KEY,
 * lib/permission/purchaseHistoryVisibility.ts). Returns false while
 * resolving and for any other/unresolved role (default-deny). */
export function useIsOwnerOrManager(): boolean {
  const [isOwnerOrManager, setIsOwnerOrManager] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const staff = await getCurrentStaff();
      const role = staff ? await resolveRoleForStaff(staff) : null;
      const result = role?.role_key === "Owner" || role?.role_key === "Manager";
      if (!cancelled) setIsOwnerOrManager(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return isOwnerOrManager;
}
