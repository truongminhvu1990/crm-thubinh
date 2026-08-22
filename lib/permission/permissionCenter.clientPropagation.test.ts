import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Authorization Resolution Client Propagation (Production Incident
 * Investigation, 2026-08-23) — regression coverage for the incident's exact
 * root cause: `resolveRoleForStaff`/`staffHasPermission`/
 * `getResolvedDataScope` (permissionCenter.service.ts) and the `apply*Scope`
 * helpers (dataScope.ts) fell back to the module-level anon Supabase client
 * whenever no `client` argument was threaded through — silently resolving
 * every staff member to "no role" on Production, since Production RLS on
 * `roles`/`permissions`/`role_permissions`/`role_data_scopes`/`staff` grants
 * no access to `anon`.
 *
 * Two fake clients simulate this exactly: `anonClient` returns zero rows
 * from every one of those five tables (Production's real RLS-filtered
 * anon behavior — PostgREST returns `[]`/`null`, never a Postgres error);
 * `realClient` returns real fixture rows (an authenticated session's real
 * RLS-permitted view). Every test below proves the fix by resolving
 * correctly through `realClient` and reproducing the original bug through
 * `anonClient` (or no client at all, the pre-fix default) — so a future
 * regression that drops the `client` argument anywhere in this call graph
 * fails loudly here instead of silently on Production.
 */

const OWNER_ROLE_ID = "role-owner";
const SALES_ROLE_ID = "role-sales";

const ROLES = [
  { id: OWNER_ROLE_ID, role_key: "Owner", name: "Owner", is_active: true },
  { id: SALES_ROLE_ID, role_key: "Sales", name: "Sales", is_active: true },
];

const PERMISSIONS = [
  { id: "perm-reports-view", permission_key: "reports.view", resource: "reports", action: "view", is_active: true },
  { id: "perm-settings-manage", permission_key: "settings.manage", resource: "settings", action: "manage", is_active: true },
];

// Owner is granted reports.view + settings.manage; Sales is granted neither
// — mirrors Production's actual Owner grants confirmed during the incident
// investigation (reports.view/reports.export genuinely granted) while still
// exercising the "unauthorized role" path via Sales.
const ROLE_PERMISSIONS = [
  { id: "rp-1", role_id: OWNER_ROLE_ID, permission_id: "perm-reports-view" },
  { id: "rp-2", role_id: OWNER_ROLE_ID, permission_id: "perm-settings-manage" },
];

const ROLE_DATA_SCOPES = [{ id: "rds-1", role_id: OWNER_ROLE_ID, resource: "orders", scope: "all" }];

const STAFF = [{ id: "staff-owner", full_name: "Owner Test", role: "Owner", role_id: OWNER_ROLE_ID, team_id: null }];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTable(allRows: any[]) {
  let rows = allRows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: (field: string, value: unknown) => {
      rows = rows.filter((r) => r[field] === value);
      return builder;
    },
    order: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  };
  return builder;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      return makeTable(tables[table] ?? []);
    },
  };
}

const anonClient = makeClient({ roles: [], permissions: [], role_permissions: [], role_data_scopes: [], staff: [] });
const realClient = makeClient({
  roles: ROLES,
  permissions: PERMISSIONS,
  role_permissions: ROLE_PERMISSIONS,
  role_data_scopes: ROLE_DATA_SCOPES,
  staff: STAFF,
});

// lib/supabase.ts constructs a real createBrowserClient() at module load
// time, which throws without real Supabase env vars. Mocking it here both
// avoids that and accurately models "no client argument passed" (every
// pre-fix call site): permissionCenter.repository.ts's default parameter
// (`client: SupabaseClient = supabase`) resolves to exactly this mock,
// same as it resolved to the real anon browser client on Production.
mock.module("@/lib/supabase", { namedExports: { supabase: anonClient } });

beforeEach(async () => {
  const { invalidatePermissionCache } = await import("./permissionCache");
  invalidatePermissionCache();
});

test("resolveRoleForStaff: with the real authenticated client, resolves the actual role (the fix)", async () => {
  const { resolveRoleForStaff } = await import("./permissionCenter.service");
  const role = await resolveRoleForStaff({ role: "Owner", role_id: OWNER_ROLE_ID }, realClient as never);
  assert.equal(role?.role_key, "Owner");
});

test("resolveRoleForStaff: with an anon-equivalent client (RLS denies every row), resolves null (reproduces the incident)", async () => {
  const { resolveRoleForStaff } = await import("./permissionCenter.service");
  const role = await resolveRoleForStaff({ role: "Owner", role_id: OWNER_ROLE_ID }, anonClient as never);
  assert.equal(role, null);
});

test("resolveRoleForStaff: with no client argument at all (pre-fix call sites), still resolves null against the default anon client", async () => {
  const { resolveRoleForStaff } = await import("./permissionCenter.service");
  const role = await resolveRoleForStaff({ role: "Owner", role_id: OWNER_ROLE_ID });
  assert.equal(role, null);
});

test("staffHasPermission: Owner with the real client is granted reports.view (matches Production's actual grant)", async () => {
  const { staffHasPermission } = await import("./permissionCenter.service");
  const allowed = await staffHasPermission(
    { id: "staff-owner-1", role: "Owner", role_id: OWNER_ROLE_ID },
    "reports.view",
    realClient as never
  );
  assert.equal(allowed, true);
});

test("staffHasPermission: same Owner grant, but resolved via the anon-equivalent client, is falsely denied — the exact 403 regression", async () => {
  const { staffHasPermission } = await import("./permissionCenter.service");
  const allowed = await staffHasPermission(
    { id: "staff-owner-2", role: "Owner", role_id: OWNER_ROLE_ID },
    "reports.view",
    anonClient as never
  );
  assert.equal(allowed, false);
});

test("staffHasPermission: unauthorized users remain blocked — Sales (no grants) is denied reports.view even via the real client", async () => {
  const { staffHasPermission } = await import("./permissionCenter.service");
  const allowed = await staffHasPermission(
    { id: "staff-sales-1", role: "Sales", role_id: SALES_ROLE_ID },
    "reports.view",
    realClient as never
  );
  assert.equal(allowed, false);
});

test("staffHasPermission: unauthorized users remain blocked — Owner is denied a permission key it was never granted", async () => {
  const { staffHasPermission } = await import("./permissionCenter.service");
  const allowed = await staffHasPermission(
    { id: "staff-owner-3", role: "Owner", role_id: OWNER_ROLE_ID },
    "reports.export", // not seeded in ROLE_PERMISSIONS above
    realClient as never
  );
  assert.equal(allowed, false);
});

test("getResolvedDataScope: with the real client, resolves the configured scope", async () => {
  const { getResolvedDataScope } = await import("./permissionCenter.service");
  const scope = await getResolvedDataScope(OWNER_ROLE_ID, "orders", realClient as never);
  assert.equal(scope, "all");
});

test("getResolvedDataScope: with the anon-equivalent client, resolves null (no visible role_data_scopes rows)", async () => {
  const { getResolvedDataScope } = await import("./permissionCenter.service");
  const scope = await getResolvedDataScope(OWNER_ROLE_ID, "orders", anonClient as never);
  assert.equal(scope, null);
});
