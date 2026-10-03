"use client";

// Phase 1.5A - React / Supabase wiring for the Reporting + Dashboard access lookup (logic and its tests: ./accessLoader).
// Only Reporting / Dashboard screens import from here (Product Owner P6).

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentStaff } from "@/lib/permission";
import { resolveStaffPermissions } from "@/lib/permission/permissionCenter.service";
import { AccessSnapshot, AccessState, EMPTY_ACCESS, createAccessLoader, decideAccess, isOwnerOrManager } from "./accessLoader";

/** The shared permission repository swallows query errors and returns [] (so an outage looks like "no grants"). When a
 * signed-in user's lookup comes back EMPTY, this re-reads the three tables strictly: if any read fails, the lookup is
 * reported as FAILED (state "error") instead of being mistaken for "no permission". Only runs on the empty path. */
async function assertPermissionTablesReadable(): Promise<void> {
  const reads = await Promise.all(
    ["roles", "permissions", "role_permissions"].map((table) => supabase.from(table).select("id", { count: "exact", head: true }))
  );
  const failed = reads.find((r) => r.error);
  if (failed?.error) throw new Error(`Permission lookup failed: ${failed.error.message}`);
}

const loader = createAccessLoader({
  // getSession() reads the local session - it is only used to key the cache by user, it makes no network call.
  sessionUserId: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
  fetchAccess: async (): Promise<AccessSnapshot> => {
    const staff = await getCurrentStaff();
    const snapshot: AccessSnapshot = staff
      ? await resolveStaffPermissions(staff).then(({ role, permissionKeys }) => ({ roleKey: role?.role_key ?? null, permissionKeys }))
      : EMPTY_ACCESS;
    if (snapshot.permissionKeys.size === 0) await assertPermissionTablesReadable();
    return snapshot;
  },
});

if (typeof window !== "undefined") {
  // Any sign-in / sign-out / token event invalidates what we remembered about "who is signed in".
  supabase.auth.onAuthStateChange(() => loader.clear());
}

/** "loading" until the lookup has answered - NEVER "denied" while unresolved - then "allowed" / "denied", or "error"
 * when the lookup itself failed (a network problem is not a missing permission). */
export function usePermission(permissionKey: string): AccessState {
  const [state, setState] = useState<AccessState>("loading");

  useEffect(() => {
    let cancelled = false;
    loader
      .get()
      .then((snapshot) => {
        if (!cancelled) setState(decideAccess(snapshot, permissionKey));
      })
      .catch((error) => {
        console.error("Reporting access lookup failed:", error);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [permissionKey]);

  return state;
}

/** Reporting/Dashboard-scoped twin of useIsOwnerOrManager (which every other module keeps using unchanged):
 * decides whether Giá vốn / Lợi nhuận gộp cards are shown. false while resolving and on any failure (default-deny). */
export function useCanSeeCostAndProfit(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loader
      .get()
      .then((snapshot) => {
        if (!cancelled) setAllowed(isOwnerOrManager(snapshot));
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return allowed;
}
