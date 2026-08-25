import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * STAFF RLS BLOCKER fix — getStaffByName/getStaffByEmail had no client
 * parameter at all, always using the module-level anon-fallback `supabase`
 * client. This is the same root cause 0204458/e52796f/BUG-002 fixed
 * elsewhere, now applied to these two lookups so `staff` can eventually be
 * safe for an authenticated-only RLS lockdown (Phase 1D) — getStaffByName is
 * called from order.service.ts's completeOrder(), a real server-side write
 * path, and getStaffByEmail from createStaffWithAuth.ts's duplicate-email
 * check.
 *
 * `makeQueryClient` builds a minimal fake mirroring the exact chain each
 * function uses (`.from("staff").select("*").eq/.ilike(...).maybeSingle()`),
 * recording which underlying client instance actually executed the query.
 */

function makeQueryClient(label: string, row: unknown = null, error: unknown = null) {
  const calls: { table: string; method: "eq" | "ilike"; column: string; value: string }[] = [];
  const builder = (method: "eq" | "ilike") => (column: string, value: string) => {
    calls.push({ table: "staff", method, column, value });
    return {
      maybeSingle: () => Promise.resolve({ data: row, error }),
    };
  };
  return {
    label,
    calls,
    from() {
      return {
        select: () => ({
          eq: builder("eq"),
          ilike: builder("ilike"),
        }),
      };
    },
  };
}

const defaultModuleClient = makeQueryClient("default-module-level");

mock.module("@/lib/supabase", { namedExports: { supabase: defaultModuleClient } });

test("getStaffByName: with an explicit client, that exact client is used, not the module-level default", async () => {
  const { getStaffByName } = await import("./staff.service");
  const explicitClient = makeQueryClient("explicit", { id: "staff-1", full_name: "Nguyen Van A" });

  const result = await getStaffByName("Nguyen Van A", explicitClient as never);

  assert.deepEqual(explicitClient.calls, [{ table: "staff", method: "eq", column: "full_name", value: "Nguyen Van A" }]);
  assert.equal(defaultModuleClient.calls.length, 0);
  assert.deepEqual(result, { id: "staff-1", full_name: "Nguyen Van A" });
});

test("getStaffByName: with no client argument, falls back to the module-level default (backward compatible)", async () => {
  const { getStaffByName } = await import("./staff.service");
  defaultModuleClient.calls.length = 0;

  await getStaffByName("Tran Thi B");

  assert.deepEqual(defaultModuleClient.calls, [{ table: "staff", method: "eq", column: "full_name", value: "Tran Thi B" }]);
});

test("getStaffByName: an anon-equivalent client that resolves no row (RLS denies) returns null, matching the existing 'no match' contract — not an error", async () => {
  const { getStaffByName } = await import("./staff.service");
  const anonClient = makeQueryClient("anon-equivalent", null);

  const result = await getStaffByName("Nguyen Van A", anonClient as never);

  assert.equal(result, null);
});

test("getStaffByEmail: with an explicit client, that exact client is used, not the module-level default", async () => {
  const { getStaffByEmail } = await import("./staff.service");
  const explicitClient = makeQueryClient("explicit", { id: "staff-1", email: "a@example.com" });
  defaultModuleClient.calls.length = 0;

  const result = await getStaffByEmail("a@example.com", explicitClient as never);

  assert.deepEqual(explicitClient.calls, [{ table: "staff", method: "ilike", column: "email", value: "a@example.com" }]);
  assert.equal(defaultModuleClient.calls.length, 0);
  assert.deepEqual(result, { id: "staff-1", email: "a@example.com" });
});

test("getStaffByEmail: with no client argument, falls back to the module-level default (backward compatible)", async () => {
  const { getStaffByEmail } = await import("./staff.service");
  defaultModuleClient.calls.length = 0;

  await getStaffByEmail("b@example.com");

  assert.deepEqual(defaultModuleClient.calls, [{ table: "staff", method: "ilike", column: "email", value: "b@example.com" }]);
});

test("getStaffByEmail: an error from the underlying query is logged and resolves null, never throws", async () => {
  const { getStaffByEmail } = await import("./staff.service");
  const errorClient = makeQueryClient("erroring", null, { code: "42501", message: "permission denied for table staff" });
  const originalConsoleError = console.error;
  let loggedError: unknown = undefined;
  console.error = (..._args: unknown[]) => {
    loggedError = _args;
  };
  try {
    const result = await getStaffByEmail("dup@example.com", errorClient as never);
    assert.equal(result, null);
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(loggedError, "the query error was logged via console.error, matching this file's existing convention");
});
