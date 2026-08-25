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
    // Additive, no-op-on-filtering passthroughs so callers this fixture
    // doesn't otherwise care about the exact result of (e.g.
    // getPermissionDashboardKpis' activity_logs .in()/.gte() query) don't
    // throw — no existing test here relies on their filtering behavior.
    in: () => builder,
    gte: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    // Generic no-op insert so callers this fixture doesn't otherwise care
    // about (e.g. activity_logs, via logActivity()) don't throw — no
    // existing test here exercises inserts, so this is purely additive.
    insert: () => Promise.resolve({ data: null, error: null }),
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

// BUG-002 Phase 1B — permission_sensitive_fields client propagation was
// missed by the original 0204458 fix: getSensitiveFieldPairings/
// pairSensitiveField/unpairSensitiveField had no client parameter at all,
// and getVisibleSensitiveFields silently dropped the client it was given.
const SENSITIVE_FIELD_PAIRINGS = [{ id: "psf-1", permission_key: "settings.manage", field_key: "cost_price" }];

const anonClient = makeClient({
  roles: [],
  permissions: [],
  role_permissions: [],
  role_data_scopes: [],
  staff: [],
  permission_sensitive_fields: [],
});
const realClient = makeClient({
  roles: ROLES,
  permissions: PERMISSIONS,
  role_permissions: ROLE_PERMISSIONS,
  role_data_scopes: ROLE_DATA_SCOPES,
  staff: STAFF,
  permission_sensitive_fields: SENSITIVE_FIELD_PAIRINGS,
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

// ============================================================
// BUG-002 Phase 1B — permission_sensitive_fields client propagation.
// ============================================================

test("getSensitiveFieldPairings (repository): with the real client, returns the actual pairings", async () => {
  const { getSensitiveFieldPairings } = await import("./permissionCenter.repository");
  const pairings = await getSensitiveFieldPairings(realClient as never);
  assert.deepEqual(pairings, SENSITIVE_FIELD_PAIRINGS);
});

test("getSensitiveFieldPairings (repository): with the anon-equivalent client, returns empty (RLS denies every row)", async () => {
  const { getSensitiveFieldPairings } = await import("./permissionCenter.repository");
  const pairings = await getSensitiveFieldPairings(anonClient as never);
  assert.deepEqual(pairings, []);
});

test("getSensitiveFieldPairings (repository): with no client argument at all (pre-fix call sites), still falls back to the default anon client", async () => {
  const { getSensitiveFieldPairings } = await import("./permissionCenter.repository");
  const pairings = await getSensitiveFieldPairings();
  assert.deepEqual(pairings, []);
});

test("getVisibleSensitiveFields: with the real client, resolves Owner's paired field via settings.manage (the fix — client now actually reaches getSensitiveFieldPairings)", async () => {
  const { getVisibleSensitiveFields } = await import("./permissionCenter.service");
  const fields = await getVisibleSensitiveFields(OWNER_ROLE_ID, realClient as never);
  assert.deepEqual([...fields], ["cost_price"]);
});

test("getVisibleSensitiveFields: with the anon-equivalent client, resolves an empty set", async () => {
  const { getVisibleSensitiveFields } = await import("./permissionCenter.service");
  const fields = await getVisibleSensitiveFields(OWNER_ROLE_ID, anonClient as never);
  assert.deepEqual([...fields], []);
});

/** Minimal write-path spy — pairSensitiveField/unpairSensitiveField need
 * .insert()/.delete().eq().eq() support the shared makeTable/makeClient
 * builder above doesn't provide (it's read-only, by design, for the
 * existing roles/permissions/staff coverage). This tracks which client
 * instance's .from() was actually invoked, which is exactly what proves
 * (or disproves) client propagation for a write call — the same-shaped
 * regression the read-path tests above prove via row visibility instead. */
function makeWriteSpyClient(label: string) {
  const calls: { op: string; table: string }[] = [];
  const client = {
    label,
    calls,
    from(table: string) {
      return {
        insert: () => {
          calls.push({ op: "insert", table });
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: () => ({
            eq: () => {
              calls.push({ op: "delete", table });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
  };
  return client;
}

test("pairSensitiveField (repository): with an explicit client, that exact client is used, not the module-level anon default", async () => {
  const { pairSensitiveField } = await import("./permissionCenter.repository");
  const spyClient = makeWriteSpyClient("explicit");
  await pairSensitiveField("settings.manage", "cost_price", spyClient as never);
  assert.deepEqual(spyClient.calls, [{ op: "insert", table: "permission_sensitive_fields" }]);
});

test("unpairSensitiveField (repository): with an explicit client, that exact client is used, not the module-level anon default", async () => {
  const { unpairSensitiveField } = await import("./permissionCenter.repository");
  const spyClient = makeWriteSpyClient("explicit");
  await unpairSensitiveField("settings.manage", "cost_price", spyClient as never);
  assert.deepEqual(spyClient.calls, [{ op: "delete", table: "permission_sensitive_fields" }]);
});

test("toggleSensitiveFieldPairing (service): pair=true threads the client through to pairSensitiveField's insert, and to logActivity's own activity_logs insert (BUG-002 Phase 2B-1 fix)", async () => {
  const { toggleSensitiveFieldPairing } = await import("./permissionCenter.service");
  const spyClient = makeWriteSpyClient("explicit");
  await toggleSensitiveFieldPairing("actor-1", "settings.manage", "cost_price", true, spyClient as never);
  assert.deepEqual(spyClient.calls, [
    { op: "insert", table: "permission_sensitive_fields" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("toggleSensitiveFieldPairing (service): pair=false threads the client through to unpairSensitiveField's delete, and to logActivity's own activity_logs insert (BUG-002 Phase 2B-1 fix)", async () => {
  const { toggleSensitiveFieldPairing } = await import("./permissionCenter.service");
  const spyClient = makeWriteSpyClient("explicit");
  await toggleSensitiveFieldPairing("actor-1", "settings.manage", "cost_price", false, spyClient as never);
  assert.deepEqual(spyClient.calls, [
    { op: "delete", table: "permission_sensitive_fields" },
    { op: "insert", table: "activity_logs" },
  ]);
});

// ============================================================
// BUG-002 Phase 2F — remaining Permission Center mutation functions
// (createRole/updateRole/setRoleActive/toggleRolePermission/
// cloneRolePermissions/setDataScope/renameTeam/assignTeam/
// assignStaffRoleAndTeam), getTeams, and getPermissionDashboardKpis.
//
// A more general chain-recording spy than makeWriteSpyClient above, since
// this batch touches insert/update/upsert/delete across roles/
// role_permissions/role_data_scopes/staff, not just one table's
// insert/delete. Deliberately doesn't simulate real row data/filtering —
// these functions' business logic is unit-tested implicitly by the full
// regression suite passing unchanged; what these tests prove is narrowly
// "does the supplied client reach every underlying call," matching the
// same standard as every other propagation test in this file.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMutationSpyClient(returnData: any = { id: "generated-id" }) {
  const calls: { op: string; table: string }[] = [];
  const client = {
    calls,
    from(table: string) {
      const record = (op: string) => calls.push({ op, table });
      let recordedSelect = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => {
          if (!recordedSelect) {
            recordedSelect = true;
            record("select");
          }
          return chain;
        },
        eq: () => chain,
        in: () => chain,
        not: () => chain,
        gte: () => chain,
        order: () => chain,
        insert: () => {
          record("insert");
          return chain;
        },
        update: () => {
          record("update");
          return chain;
        },
        upsert: () => {
          record("upsert");
          return chain;
        },
        delete: () => {
          record("delete");
          return chain;
        },
        single: () => Promise.resolve({ data: returnData, error: null }),
        maybeSingle: () => Promise.resolve({ data: returnData, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 }),
      };
      return chain;
    },
  };
  return client;
}

test("createRole: threads the client into insertRole and logActivity", async () => {
  const { createRole } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await createRole("actor-1", { role_key: "test_role", name: "Test Role" }, spy as never);
  assert.deepEqual(spy.calls, [
    { op: "insert", table: "roles" },
    { op: "select", table: "roles" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("updateRole: threads the client into updateRoleRow and logActivity", async () => {
  const { updateRole } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await updateRole("actor-1", "role-1", { name: "Renamed" }, spy as never);
  assert.deepEqual(spy.calls, [
    { op: "update", table: "roles" },
    { op: "select", table: "roles" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("setRoleActive: threads the client into updateRoleRow and logActivity", async () => {
  const { setRoleActive } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await setRoleActive("actor-1", "role-1", false, spy as never);
  assert.deepEqual(spy.calls, [
    { op: "update", table: "roles" },
    { op: "select", table: "roles" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("toggleRolePermission: grant=true threads the client into grantPermission and logActivity", async () => {
  const { toggleRolePermission } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await toggleRolePermission("actor-1", "role-1", "perm-1", true, spy as never);
  assert.deepEqual(spy.calls, [
    { op: "insert", table: "role_permissions" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("toggleRolePermission: grant=false threads the client into revokePermission and logActivity", async () => {
  const { toggleRolePermission } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await toggleRolePermission("actor-1", "role-1", "perm-1", false, spy as never);
  assert.deepEqual(spy.calls, [
    { op: "delete", table: "role_permissions" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("cloneRolePermissions: threads the client into clonePermissions' two reads and logActivity", async () => {
  const { cloneRolePermissions } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await cloneRolePermissions("actor-1", "role-source", "role-target", spy as never);
  // sourceGrants resolves empty via this spy, so clonePermissions returns
  // early (0 cloned) without ever reaching its own insert — still proves
  // both reads and the unconditional logActivity call use the right client.
  assert.deepEqual(spy.calls, [
    { op: "select", table: "role_permissions" },
    { op: "select", table: "role_permissions" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("setDataScope: threads the client into setRoleDataScope's upsert and logActivity", async () => {
  const { setDataScope } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await setDataScope("actor-1", "role-1", "orders", "all", spy as never);
  assert.deepEqual(spy.calls, [
    { op: "upsert", table: "role_data_scopes" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("renameTeam: threads the client into renameTeamForAllMembers' update and logActivity", async () => {
  const { renameTeam } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await renameTeam("actor-1", "team-old", "team-new", spy as never);
  assert.deepEqual(spy.calls, [
    { op: "update", table: "staff" },
    { op: "select", table: "staff" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("assignTeam: threads the client into assignStaffTeam's update and logActivity", async () => {
  const { assignTeam } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await assignTeam("actor-1", ["staff-1", "staff-2"], "team-1", spy as never);
  assert.deepEqual(spy.calls, [
    { op: "update", table: "staff" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("assignStaffRoleAndTeam: threads the client into updateStaffRoleAssignment and both logActivity calls (role_id + team_id both set)", async () => {
  const { assignStaffRoleAndTeam } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await assignStaffRoleAndTeam("actor-1", "staff-1", { role_id: "role-1", team_id: "team-1" }, spy as never);
  assert.deepEqual(spy.calls, [
    { op: "update", table: "staff" },
    { op: "select", table: "staff" },
    { op: "insert", table: "activity_logs" },
    { op: "insert", table: "activity_logs" },
  ]);
});

test("getTeams: threads the client into getStaffTeams", async () => {
  const { getTeams } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await getTeams(spy as never);
  assert.deepEqual(spy.calls, [{ op: "select", table: "staff" }]);
});

test("getPermissionDashboardKpis: threads the supplied client into all 4 underlying queries (roles/permissions/staff/activity_logs)", async () => {
  const { getPermissionDashboardKpis } = await import("./permissionCenter.service");
  const spy = makeMutationSpyClient();
  await getPermissionDashboardKpis(spy as never);
  assert.deepEqual(spy.calls, [
    { op: "select", table: "roles" },
    { op: "select", table: "permissions" },
    { op: "select", table: "staff" },
    { op: "select", table: "activity_logs" },
  ]);
});

test("getPermissionDashboardKpis: with no client argument, falls back to the default (existing behavior preserved)", async () => {
  const { getPermissionDashboardKpis } = await import("./permissionCenter.service");
  const kpis = await getPermissionDashboardKpis();
  assert.equal(typeof kpis.totalRoles, "number");
});

test("getPermissionDashboardKpis: with the real client, sees Owner/Sales staff rows; with the anon-equivalent client, sees none (RLS denies)", async () => {
  const { getPermissionDashboardKpis } = await import("./permissionCenter.service");
  const withReal = await getPermissionDashboardKpis(realClient as never);
  const withAnon = await getPermissionDashboardKpis(anonClient as never);
  assert.equal(withReal.totalStaff, STAFF.length);
  assert.equal(withAnon.totalStaff, 0);
});
