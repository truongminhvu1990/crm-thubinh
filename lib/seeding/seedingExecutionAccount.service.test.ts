import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2K-E — seeding_execution_accounts CRUD. Same per-table sequenced-
 * fake-client pattern as seedingTask.service.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

interface FakeResult {
  data: unknown;
  error?: unknown;
}

function makeClient(perTableSequence: Record<string, FakeResult[]>) {
  const counters: Record<string, number> = {};
  return {
    from(table: string) {
      const seq = perTableSequence[table];
      if (!seq) throw new Error(`Unexpected table in test fake: ${table}`);
      const idx = counters[table] ?? 0;
      counters[table] = idx + 1;
      const result = seq[idx] ?? seq[seq.length - 1];

      const handler: ProxyHandler<object> = {
        get(_target, prop) {
          const resolved = Promise.resolve({ error: null, ...result });
          if (prop === "then") return resolved.then.bind(resolved);
          if (prop === "catch") return resolved.catch.bind(resolved);
          return () => proxy;
        },
      };
      const proxy: unknown = new Proxy({}, handler);
      return proxy;
    },
  } as never;
}

test("createExecutionAccount: creates with just display_name", async () => {
  const { createExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: { id: "acct-1", display_name: "Nick Facebook A", status: "Active" } }],
  });

  const result = await createExecutionAccount({ display_name: "Nick Facebook A" }, "staff-1", client);
  assert.equal(result.display_name, "Nick Facebook A");
  assert.equal(result.status, "Active");
});

test("createExecutionAccount: rejects a missing/empty display_name before any write", async () => {
  const { createExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({});
  await assert.rejects(() => createExecutionAccount({ display_name: "  " }, "staff-1", client), /display_name là bắt buộc/);
});

test("updateExecutionAccount: can deactivate an account (status -> Inactive)", async () => {
  const { updateExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: { id: "acct-1", display_name: "Nick Facebook A", status: "Inactive" } }],
  });

  const result = await updateExecutionAccount("acct-1", { status: "Inactive" }, "staff-1", client);
  assert.equal(result.status, "Inactive");
});

test("updateExecutionAccount: rejects clearing display_name to empty", async () => {
  const { updateExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({});
  await assert.rejects(() => updateExecutionAccount("acct-1", { display_name: "" }, "staff-1", client), /display_name là bắt buộc/);
});

test("getActiveExecutionAccounts: filters to Active status, ordered by created_at then id", async () => {
  const { getActiveExecutionAccounts } = await import("./seedingExecutionAccount.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: [{ id: "acct-1", display_name: "A", status: "Active" }] }],
  });

  const result = await getActiveExecutionAccounts(client);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "Active");
});

/** Phase 2K-V — Execution Setup's new "Nhân viên phụ trách" selector writes
 * this same pre-existing field; these confirm the create/update path never
 * drops it. */
test("createExecutionAccount: persists a responsible staff member (assigned_staff_id)", async () => {
  const { createExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({
    seeding_execution_accounts: [
      { data: { id: "acct-1", display_name: "Nick Vũ 1", status: "Active", assigned_staff_id: "staff-9" } },
    ],
  });

  const result = await createExecutionAccount({ display_name: "Nick Vũ 1", assigned_staff_id: "staff-9" }, "staff-1", client);
  assert.equal(result.assigned_staff_id, "staff-9");
});

test("createExecutionAccount: omitting assigned_staff_id still creates the account (null-supported)", async () => {
  const { createExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: { id: "acct-1", display_name: "Nick Vũ 1", status: "Active", assigned_staff_id: null } }],
  });

  const result = await createExecutionAccount({ display_name: "Nick Vũ 1" }, "staff-1", client);
  assert.equal(result.assigned_staff_id, null);
});

test("updateExecutionAccount: can set assigned_staff_id on an existing account", async () => {
  const { updateExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({
    seeding_execution_accounts: [
      { data: { id: "acct-1", display_name: "Nick Vũ 1", status: "Active", assigned_staff_id: "staff-9" } },
    ],
  });

  const result = await updateExecutionAccount("acct-1", { assigned_staff_id: "staff-9" }, "staff-1", client);
  assert.equal(result.assigned_staff_id, "staff-9");
});

test("updateExecutionAccount: can clear assigned_staff_id back to null", async () => {
  const { updateExecutionAccount } = await import("./seedingExecutionAccount.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: { id: "acct-1", display_name: "Nick Vũ 1", status: "Active", assigned_staff_id: null } }],
  });

  const result = await updateExecutionAccount("acct-1", { assigned_staff_id: null }, "staff-1", client);
  assert.equal(result.assigned_staff_id, null);
});
