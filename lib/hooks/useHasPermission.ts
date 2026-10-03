"use client";

import { usePermission } from "./reportingAccess";

export { usePermission };

/** Generic, permission-key-based UI-visibility hook — reads the real
 * DB-backed Permission Center grant (role_permissions), not a hardcoded
 * role list, per the Inventory Adjustments/Audit Product Owner directive's
 * explicit instruction: "Do NOT use hard-coded role checks where the
 * existing permission system can express the decision." Same "UI-hiding
 * only, every write endpoint re-checks server-side regardless" pattern
 * already established by useIsOwner/useIsOwnerOrManager — this hook
 * doesn't replace requirePermission() on the API route, it only decides
 * whether to render the control at all.
 *
 * Phase 1.5A: boolean convenience wrapper over usePermission(). It is true ONLY once the grant has been confirmed;
 * screens that must tell "still loading" apart from "denied" use usePermission() directly. */
export function useHasPermission(permissionKey: string): boolean {
  return usePermission(permissionKey) === "allowed";
}
