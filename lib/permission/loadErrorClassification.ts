export type PermissionLoadErrorKind = "unauthorized" | "forbidden" | "network" | "unknown";

export interface PermissionLoadError {
  kind: PermissionLoadErrorKind;
  message: string;
}

/** Classifies a thrown error from `permissionApi.*` calls (which throw
 * `Error(json.error || "Yêu cầu thất bại (${status})")` on any non-2xx
 * response - see `lib/permission/permissionCenterApi.ts#getJson`) so a page
 * can render an explicit access/error state instead of silently falling
 * into an empty-results view or an indefinite spinner.
 *
 * Production Authorization Incident (2026-09-21): the Permission Matrix
 * page's `load()` had no error handling around its `Promise.all(...)` at
 * all - a 401/403 guard failure left `isLoading` stuck `true` forever
 * (an infinite spinner), never the page's own "Không tìm thấy quyền phù
 * hợp" empty-state text, which is only reachable when every call actually
 * succeeds with a genuinely empty result. This function, and the page-level
 * handling that uses it, close that gap: any Promise.all rejection now
 * resolves to a classified, user-visible error state instead of an
 * indefinite spinner. */
export function classifyPermissionLoadError(error: unknown): PermissionLoadError {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof TypeError) {
    // fetch() itself rejects with a TypeError on a network failure
    // (offline, DNS, CORS) - it never reaches getJson's res.ok check.
    return { kind: "network", message };
  }
  if (message === "Unauthorized" || message.includes("(401)")) {
    return { kind: "unauthorized", message };
  }
  if (message === "Forbidden" || message.includes("(403)")) {
    return { kind: "forbidden", message };
  }
  return { kind: "unknown", message };
}
