import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { Staff } from "@/types/staff";

/**
 * Authorization Resolution Client Propagation (Production Incident
 * Investigation, 2026-08-23) — proves the actual query-filter outcome of
 * dataScope.ts's apply*Scope helpers (Orders/Customers/Revenue/Commissions/
 * Activity Log Data Scope) with a real authenticated client vs. the
 * anon-equivalent default. Reproduces the exact "0 đơn hàng" symptom
 * (Owner's own orders silently filtered to nothing) and proves the fix.
 */

const OWNER_ROLE_ID = "role-owner";
// Explicit Pick<Staff, ...> annotation (not inferred): this object is
// declared once and reused across every test below via the OWNER_STAFF
// binding, unlike permissionCenter.clientPropagation.test.ts's identical-
// looking literals, which are written inline at each call site and never
// hit this - TypeScript widens an object literal's string-valued
// properties (here, `role: "Owner"`) to `string` at its own declaration
// site when there's no annotation and no contextual type to narrow
// against, so the widened type is what every later call site sees.
const OWNER_STAFF: Pick<Staff, "id" | "role" | "role_id" | "team_id" | "full_name"> = {
  id: "staff-owner",
  role: "Owner",
  role_id: OWNER_ROLE_ID,
  team_id: null,
  full_name: "Vũ",
};

const ROLES = [{ id: OWNER_ROLE_ID, role_key: "Owner", name: "Owner", is_active: true }];
const ROLE_DATA_SCOPES = [
  { id: "rds-1", role_id: OWNER_ROLE_ID, resource: "orders", scope: "all" },
  { id: "rds-2", role_id: OWNER_ROLE_ID, resource: "customers", scope: "all" },
  { id: "rds-3", role_id: OWNER_ROLE_ID, resource: "revenue", scope: "all" },
];
const STAFF = [{ id: "staff-owner", full_name: "Vũ", role: "Owner", role_id: OWNER_ROLE_ID, team_id: null }];

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
  return { from: (table: string) => makeTable(tables[table] ?? []) };
}

const anonClient = makeClient({ roles: [], permissions: [], role_permissions: [], role_data_scopes: [], staff: [] });
const realClient = makeClient({ roles: ROLES, permissions: [], role_permissions: [], role_data_scopes: ROLE_DATA_SCOPES, staff: STAFF });

mock.module("@/lib/supabase", { namedExports: { supabase: anonClient } });

beforeEach(async () => {
  const { invalidatePermissionCache } = await import("./permissionCache");
  invalidatePermissionCache();
});

/** Minimal fake `orders`-shaped query builder — mirrors the real
 * OrFilterQuery shape (eq/in/ilike/or), records every call so the test can
 * assert exactly which branch applyDataScopeByName took, and resolves the
 * real fixture rows a genuine Postgrest builder would. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeOrdersQuery(rows: any[]) {
  const calls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {
    calls,
    eq: (field: string, value: unknown) => {
      calls.push(`eq(${field},${value})`);
      q.result = rows.filter((r) => r[field] === value);
      return q;
    },
    ilike: (field: string, value: unknown) => {
      calls.push(`ilike(${field},${value})`);
      q.result = rows.filter((r) => String(r[field]).toLowerCase() === String(value).toLowerCase());
      return q;
    },
    or: (expr: string) => {
      calls.push(`or(${expr})`);
      // Simplified: treat any "all real orders visible" or-expression as
      // returning every row (only used by the isOwnerRole "all" branch's
      // unresolved-name carve-out in these tests, which stays empty).
      q.result = rows;
      return q;
    },
    in: (field: string, values: unknown[]) => {
      calls.push(`in(${field},${JSON.stringify(values)})`);
      q.result = rows.filter((r) => (values as unknown[]).includes(r[field]));
      return q;
    },
    result: rows,
  };
  return q;
}

test("applyDataScopeByName (orders): with the real client, Owner (scope=all) sees the query unchanged — the fix restores 'đơn hàng'", async () => {
  const { applyDataScopeByName } = await import("./dataScope");
  const orders = [{ id: "order-1", sales_owner: "Vũ" }];
  const query = makeOrdersQuery(orders);
  const { query: scoped } = await applyDataScopeByName(query, OWNER_STAFF, "orders", "sales_owner", realClient as never);
  assert.equal(scoped, query, "scope=all must return the query completely unfiltered");
});

test("applyDataScopeByName (orders): with the anon-equivalent client, role resolves null and every order is default-denied — reproduces '0 đơn hàng'", async () => {
  const { applyDataScopeByName } = await import("./dataScope");
  const orders = [{ id: "order-1", sales_owner: "Vũ" }];
  const query = makeOrdersQuery(orders);
  const { query: scoped } = await applyDataScopeByName(query, OWNER_STAFF, "orders", "sales_owner", anonClient as never);
  assert.deepEqual(scoped.result, [], "no client -> resolveRoleForStaff returns null -> NEVER_MATCHES_TEXT filter -> zero rows");
});

test("applyDataScope (customers): with the real client, Owner (scope=all) sees the query unchanged", async () => {
  const { applyDataScope } = await import("./dataScope");
  const query = { eq: () => query, in: () => query, ilike: () => query };
  const { query: scoped } = await applyDataScope(query, OWNER_STAFF, "customers", undefined, realClient as never);
  assert.equal(scoped, query);
});

test("applyDataScope (customers): with the anon-equivalent client, defaults to NEVER_MATCHES (default-deny)", async () => {
  const { applyDataScope } = await import("./dataScope");
  let filteredField: string | undefined;
  let filteredValue: unknown;
  const query = {
    eq: (field: string, value: unknown) => {
      filteredField = field;
      filteredValue = value;
      return query;
    },
    in: () => query,
    ilike: () => query,
  };
  await applyDataScope(query, OWNER_STAFF, "customers", undefined, anonClient as never);
  assert.equal(filteredField, "assigned_staff_id");
  assert.equal(filteredValue, "00000000-0000-0000-0000-000000000000");
});

test("applyDataScopeWithFallback (revenue/commissions): with the real client, Owner (scope=all) sees the query unchanged", async () => {
  const { applyDataScopeWithFallback } = await import("./dataScope");
  const query = { eq: () => query, in: () => query, ilike: () => query, or: () => query };
  const { query: scoped } = await applyDataScopeWithFallback(
    query,
    OWNER_STAFF,
    "revenue",
    "salesperson_id",
    "salesperson",
    realClient as never
  );
  assert.equal(scoped, query);
});

test("applyActivityLogScope: with the real client, Owner's locked 'all' mapping applies (query unchanged)", async () => {
  const { applyActivityLogScope } = await import("./dataScope");
  const query = { eq: () => query, in: () => query, ilike: () => query };
  const { query: scoped } = await applyActivityLogScope(query, OWNER_STAFF, "staff_id", realClient as never);
  assert.equal(scoped, query);
});

test("applyActivityLogScope: with the anon-equivalent client, role resolves null and defaults to NEVER_MATCHES", async () => {
  const { applyActivityLogScope } = await import("./dataScope");
  let filteredValue: unknown;
  const query = {
    eq: (_field: string, value: unknown) => {
      filteredValue = value;
      return query;
    },
    in: () => query,
    ilike: () => query,
  };
  await applyActivityLogScope(query, OWNER_STAFF, "staff_id", anonClient as never);
  assert.equal(filteredValue, "00000000-0000-0000-0000-000000000000");
});
