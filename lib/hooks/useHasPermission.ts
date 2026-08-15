"use client";

import { useEffect, useState } from "react";
import { getCurrentStaff } from "@/lib/permission";
import { staffHasPermission } from "@/lib/permission/permissionCenter.service";

/** Generic, permission-key-based UI-visibility hook — reads the real
 * DB-backed Permission Center grant (role_permissions), not a hardcoded
 * role list, per the Inventory Adjustments/Audit Product Owner directive's
 * explicit instruction: "Do NOT use hard-coded role checks where the
 * existing permission system can express the decision." Same "UI-hiding
 * only, every write endpoint re-checks server-side regardless" pattern
 * already established by useIsOwner/useIsOwnerOrManager — this hook
 * doesn't replace requirePermission() on the API route, it only decides
 * whether to render the control at all. */
export function useHasPermission(permissionKey: string): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const staff = await getCurrentStaff();
      const result = staff ? await staffHasPermission(staff, permissionKey) : false;
      if (!cancelled) setAllowed(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [permissionKey]);

  return allowed;
}
