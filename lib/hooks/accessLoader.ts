// Phase 1.5A - pure logic of the Reporting/Dashboard "who am I and what may I see" lookup. No React, no Supabase import:
// everything environment-specific is injected, so the caching rules below are unit-tested exactly as they run in production.
//
// Scope (Product Owner, P6): used by Reporting / Dashboard hooks ONLY. Orders, Products and every other module keep
// their own lookups. This only avoids repeating, on every component and every page change, the same read-only
// identity + role + grant lookup. The server's requirePermission() is, and stays, the final authority.

export interface AccessSnapshot {
  /** Role key resolved for the signed-in staff member (e.g. "Owner"), or null when no role resolves. */
  roleKey: string | null;
  /** Every permission key granted to that role. */
  permissionKeys: ReadonlySet<string>;
}

/** What a screen may do right now. "loading" is NOT "denied": the false "no permission" flash is this distinction. */
export type AccessState = "loading" | "allowed" | "denied" | "error";

export const EMPTY_ACCESS: AccessSnapshot = { roleKey: null, permissionKeys: new Set<string>() };

export function decideAccess(snapshot: AccessSnapshot | null | undefined, permissionKey: string): "allowed" | "denied" {
  return snapshot?.permissionKeys.has(permissionKey) ? "allowed" : "denied";
}

export function isOwnerOrManager(snapshot: AccessSnapshot | null | undefined): boolean {
  return snapshot?.roleKey === "Owner" || snapshot?.roleKey === "Manager";
}

export interface AccessLoaderDeps {
  /** Id of the signed-in user, read from the LOCAL session (no network). null = nobody signed in. */
  sessionUserId: () => Promise<string | null>;
  /** The real (read-only) lookup: staff row -> role -> granted permission keys. */
  fetchAccess: () => Promise<AccessSnapshot>;
  now?: () => number;
  /** Same horizon as the server-side permission cache (60 s), so the UI never trusts a snapshot longer than the server does. */
  ttlMs?: number;
}

export interface AccessLoader {
  get(): Promise<AccessSnapshot>;
  clear(): void;
}

export function createAccessLoader(deps: AccessLoaderDeps): AccessLoader {
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? 60_000;
  let cache: { userId: string; at: number; value: AccessSnapshot } | null = null;
  let inflight: { userId: string | null; promise: Promise<AccessSnapshot> } | null = null;
  let generation = 0;

  async function get(): Promise<AccessSnapshot> {
    const userId = await deps.sessionUserId();
    if (userId === null) return EMPTY_ACCESS; // not signed in: nothing to look up, nothing is cached
    if (cache && cache.userId === userId && now() - cache.at < ttlMs) return cache.value;
    // Several components (and the page itself) ask at the same moment: they all share ONE lookup.
    if (inflight && inflight.userId === userId) return inflight.promise;

    const startedIn = generation;
    const promise = deps.fetchAccess().then((value) => {
      // A sign-in/sign-out (clear) that happened while this lookup was running makes its answer untrustworthy.
      if (startedIn === generation) cache = { userId, at: now(), value };
      return value;
    });
    const slot = { userId, promise };
    inflight = slot;
    try {
      return await promise;
    } finally {
      // A failed lookup is never cached: the next caller retries.
      if (inflight === slot) inflight = null;
    }
  }

  function clear() {
    generation += 1;
    cache = null;
    inflight = null;
  }

  return { get, clear };
}
