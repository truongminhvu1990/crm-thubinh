import { Role } from "@/types/permissionCenter";

// Permission Cache (Decision 21) - session-scoped (keyed by staff id),
// short TTL, in-memory. A single Node.js server process's module scope is
// the "session store" here - this codebase has no session/cache
// infrastructure (no Redis, no edge KV) and introducing one would be far
// outside this revision's scope. Deliberately caches only the role +
// granted-permission-key resolution (DB §10 steps 2-4) - Data Scope
// resolution is NOT cached (Decision 21 only names Role/Permission
// changes as invalidation triggers, and getResolvedDataScope() is a
// separate, uncached path).

interface CacheEntry {
  role: Role | null;
  permissionKeys: Set<string>;
  expiresAt: number;
}

const TTL_MS = 60_000;

const cache = new Map<string, CacheEntry>();

export function getCachedPermissions(staffId: string): { role: Role | null; permissionKeys: Set<string> } | null {
  const entry = cache.get(staffId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(staffId);
    return null;
  }
  return { role: entry.role, permissionKeys: entry.permissionKeys };
}

export function setCachedPermissions(staffId: string, role: Role | null, permissionKeys: Set<string>): void {
  cache.set(staffId, { role, permissionKeys, expiresAt: Date.now() + TTL_MS });
}

/** Called after any Role or Permission change (create/update/enable/
 * disable a role, grant/revoke/clone a permission) - Decision 21's
 * invalidation trigger. Clears every session's cache rather than trying to
 * identify exactly which staff were affected (a role change can affect an
 * unknown number of staff currently resolving through it) - simplest
 * correct behavior, and the TTL is short enough that this is cheap. */
export function invalidatePermissionCache(): void {
  cache.clear();
}
