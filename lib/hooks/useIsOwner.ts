"use client";

import { useEffect, useState } from "react";
import { getCurrentStaff } from "@/lib/permission";
import { resolveRoleForStaff } from "@/lib/permission/permissionCenter.service";

/** Orders Admin/Owner Full Control (Product Owner Decision, 2026-08-13) — the
 * one role check the Order Detail page reuses to decide whether the Edit
 * (order-level fields) and Delete lifecycle-status gates are lifted. Same
 * "fixed mapping"/default-deny pattern already used by useIsOwnerOrManager/
 * useCanWriteOrders (this codebase's precedent for role checks that control
 * UI visibility only — every write endpoint re-checks server-side
 * regardless, so this is never the only gate). Deliberately Owner-only, not
 * Owner-or-Manager: this decision is explicitly scoped to Admin/Owner, not
 * broadened to Manager. */
export function useIsOwner(): boolean {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const staff = await getCurrentStaff();
      const role = staff ? await resolveRoleForStaff(staff) : null;
      if (!cancelled) setIsOwner(role?.role_key === "Owner");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return isOwner;
}
