import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * BUG-002 Phase 2B-1 — activity_logs client propagation. logActivity() had
 * no client parameter at all before this fix, always using the module-level
 * anon-fallback `supabase` client — the same root cause 0204458/e52796f
 * fixed elsewhere, now applied to the shared audit-log writer.
 *
 * Two fake clients: `anonClient` simulates Production RLS denying an insert
 * (no anon/public policy — matches the real activity_logs table once its
 * own anon policy is eventually removed, a separate, not-yet-scheduled
 * lockdown); `realClient` simulates a client with real access (RLS allows
 * the insert). logActivity's own convention is "log, don't throw" — an
 * insert error is caught and console.error'd, never propagated — so these
 * tests assert on which client's insert was actually invoked, not on
 * logActivity throwing.
 */

function makeSpyClient(label: string, insertResult: { error: unknown } = { error: null }) {
  const inserts: unknown[] = [];
  return {
    label,
    inserts,
    from(table: string) {
      return {
        insert: (row: unknown) => {
          inserts.push({ table, row });
          return Promise.resolve(insertResult);
        },
      };
    },
  };
}

const defaultModuleClient = makeSpyClient("default-module-level");

mock.module("@/lib/supabase", { namedExports: { supabase: defaultModuleClient } });

test("logActivity: with an explicit client, that exact client is used, not the module-level default", async () => {
  const { logActivity } = await import("./activityLog.service");
  const explicitClient = makeSpyClient("explicit");
  const entry = { staff_id: "staff-1", action: "test_action", entity: "test_entity", entity_id: "entity-1" };

  await logActivity(entry, explicitClient as never);

  assert.equal(explicitClient.inserts.length, 1);
  assert.deepEqual(explicitClient.inserts[0], { table: "activity_logs", row: entry });
  assert.equal(defaultModuleClient.inserts.length, 0);
});

test("logActivity: with no client argument, falls back to the module-level default (backward compatible)", async () => {
  const { logActivity } = await import("./activityLog.service");
  defaultModuleClient.inserts.length = 0;
  const entry = { staff_id: null, action: "test_action_default", entity: "test_entity", entity_id: null };

  await logActivity(entry);

  assert.equal(defaultModuleClient.inserts.length, 1);
  assert.deepEqual(defaultModuleClient.inserts[0], { table: "activity_logs", row: entry });
});

test("logActivity: an anon-equivalent client (RLS denies the insert) reproduces the original 403-style failure — logged, never thrown", async () => {
  const { logActivity } = await import("./activityLog.service");
  const anonClient = makeSpyClient("anon-equivalent", {
    error: { code: "42501", message: 'new row violates row-level security policy for table "activity_logs"' },
  });
  const originalConsoleError = console.error;
  let loggedError: unknown = undefined;
  console.error = (..._args: unknown[]) => {
    loggedError = _args;
  };
  try {
    await logActivity({ staff_id: null, action: "test", entity: "test_entity", entity_id: null }, anonClient as never);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(anonClient.inserts.length, 1, "the insert attempt still happened (RLS denies at the DB, not the client)");
  assert.ok(loggedError, "the RLS denial was logged via console.error, matching the existing log-don't-throw convention");
});

test("logActivity: a client with real access succeeds with no error", async () => {
  const { logActivity } = await import("./activityLog.service");
  const realClient = makeSpyClient("real-access");
  const originalConsoleError = console.error;
  let consoleErrorCalled = false;
  console.error = () => {
    consoleErrorCalled = true;
  };
  try {
    await logActivity({ staff_id: "staff-1", action: "test", entity: "test_entity", entity_id: "e-1" }, realClient as never);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(realClient.inserts.length, 1);
  assert.equal(consoleErrorCalled, false);
});

test("logActivity: existing behavior unchanged — payload shape and best-effort (never throws) preserved regardless of client", async () => {
  const { logActivity } = await import("./activityLog.service");
  const errorClient = makeSpyClient("erroring", { error: { message: "some db error" } });
  const entry = { staff_id: "s1", action: "a", entity: "e", entity_id: "i1" };

  // Must not throw even when the underlying insert errors — same
  // "log, don't throw" contract as before this fix.
  await assert.doesNotReject(() => logActivity(entry, errorClient as never));
  assert.deepEqual(errorClient.inserts[0], { table: "activity_logs", row: entry });
});
