import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2K-E — seedingDistribution.service.ts. Same per-table sequenced-
 * fake-client pattern as seedingTask.service.test.ts. previewDistribution
 * only ever calls .select() (never .insert()/.update()/.delete()) — a
 * dedicated write-tracking fake proves this explicitly in one test.
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

const TARGET_ROW = {
  data: { campaign_id: "c1", facebook_page_posts: { message: "Livestream trưa nay", permalink_url: "https://fb.com/post/1" }, facebook_manual_content_references: null },
};

test("previewDistribution: zero active execution accounts -> confirmAllowed false, no candidates assigned", async () => {
  const { previewDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [{ data: [{ id: "d1", label: "Nhóm A", status: "Active" }] }],
  });

  const result = await previewDistribution("c1", { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: [] }, client);
  assert.equal(result.confirmAllowed, false);
  assert.equal(result.assignableCandidates, 0);
  assert.equal(result.proposedAssignments.length, 0);
});

test("previewDistribution: zero active destinations -> confirmAllowed false", async () => {
  const { previewDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active" }] }],
  });

  const result = await previewDistribution("c1", { campaign_target_id: "tg1", destination_ids: [], execution_account_ids: ["a1"] }, client);
  assert.equal(result.confirmAllowed, false);
});

test("previewDistribution: one destination + one account -> a single trivial assignment", async () => {
  const { previewDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [{ data: [{ id: "d1", label: "Nhóm A", status: "Active" }] }],
    seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active" }] }],
    seeding_tasks: [{ data: [] }], // no existing tasks for this destination
  });

  const result = await previewDistribution("c1", { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: ["a1"] }, client);
  assert.equal(result.confirmAllowed, true);
  assert.equal(result.proposedAssignments.length, 1);
  assert.equal(result.proposedAssignments[0].destination_id, "d1");
  assert.equal(result.proposedAssignments[0].execution_account_id, "a1");
  assert.equal(result.proposedAssignments[0].source_type, "Page");
  assert.equal(result.proposedAssignments[0].already_exists, false);
});

test("previewDistribution: multiple destinations + multiple accounts -> correct deterministic round-robin", async () => {
  const { previewDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [
      {
        data: [
          { id: "d1", label: "Nhóm 1", status: "Active", created_at: "2026-08-01T00:00:00Z" },
          { id: "d2", label: "Nhóm 2", status: "Active", created_at: "2026-08-02T00:00:00Z" },
          { id: "d3", label: "Nhóm 3", status: "Active", created_at: "2026-08-03T00:00:00Z" },
        ],
      },
    ],
    seeding_execution_accounts: [
      {
        data: [
          { id: "a1", display_name: "Acct 1", status: "Active", created_at: "2026-08-01T00:00:00Z" },
          { id: "a2", display_name: "Acct 2", status: "Active", created_at: "2026-08-02T00:00:00Z" },
        ],
      },
    ],
    seeding_tasks: [{ data: [] }],
  });

  const result = await previewDistribution(
    "c1",
    { campaign_target_id: "tg1", destination_ids: ["d1", "d2", "d3"], execution_account_ids: ["a1", "a2"] },
    client
  );
  assert.deepEqual(
    result.proposedAssignments.map((a) => [a.destination_id, a.execution_account_id]),
    [
      ["d1", "a1"],
      ["d2", "a2"],
      ["d3", "a1"],
    ]
  );
});

test("previewDistribution: an existing non-terminal task for a destination is flagged as a duplicate, not silently omitted", async () => {
  const { previewDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [{ data: [{ id: "d1", label: "Nhóm A", status: "Active" }] }],
    seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active" }] }],
    seeding_tasks: [{ data: [{ id: "existing-task-1", destination_id: "d1" }] }],
  });

  const result = await previewDistribution("c1", { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: ["a1"] }, client);
  assert.equal(result.proposedAssignments.length, 1, "the duplicate destination must still appear in the review rows");
  assert.equal(result.proposedAssignments[0].already_exists, true);
  assert.deepEqual(result.duplicates, [{ destination_id: "d1", existing_task_id: "existing-task-1" }]);
});

test("previewDistribution: an Inactive destination is excluded with an explicit reason, never silently dropped", async () => {
  const { previewDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [
      {
        data: [
          { id: "d1", label: "Nhóm hoạt động", status: "Active" },
          { id: "d2", label: "Nhóm ngừng hoạt động", status: "Inactive" },
        ],
      },
    ],
    seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active" }] }],
    seeding_tasks: [{ data: [] }],
  });

  const result = await previewDistribution(
    "c1",
    { campaign_target_id: "tg1", destination_ids: ["d1", "d2"], execution_account_ids: ["a1"] },
    client
  );
  assert.equal(result.proposedAssignments.length, 1);
  assert.equal(result.proposedAssignments[0].destination_id, "d1");
  assert.equal(result.unavailableDestinations.length, 1);
  assert.equal(result.unavailableDestinations[0].destination_id, "d2");
});

test("previewDistribution: performs zero database writes", async () => {
  const { previewDistribution } = await import("./seedingDistribution.service");
  const writeCalls: string[] = [];

  function makeReadOnlyTrackingClient() {
    const perTable: Record<string, FakeResult[]> = {
      seeding_campaign_targets: [TARGET_ROW],
      seeding_destinations: [{ data: [{ id: "d1", label: "Nhóm A", status: "Active" }] }],
      seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active" }] }],
      seeding_tasks: [{ data: [] }],
    };
    const counters: Record<string, number> = {};
    return {
      from(table: string) {
        const seq = perTable[table];
        const idx = counters[table] ?? 0;
        counters[table] = idx + 1;
        const result = seq[idx] ?? seq[seq.length - 1];
        const handler: ProxyHandler<object> = {
          get(_target, prop) {
            if (prop === "insert" || prop === "update" || prop === "delete" || prop === "upsert") {
              writeCalls.push(`${table}.${String(prop)}`);
            }
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

  await previewDistribution(
    "c1",
    { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: ["a1"] },
    makeReadOnlyTrackingClient()
  );
  assert.deepEqual(writeCalls, [], "previewDistribution must never call insert/update/delete/upsert on any table");
});

/**
 * confirmDistribution — server-side recomputation, never trusts a
 * client-submitted assignment; only selection ids are ever accepted.
 */

test("confirmDistribution: creates a task per destination, recomputed server-side from selection ids only", async () => {
  const { confirmDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [{ data: [{ id: "d1", label: "Nhóm A", status: "Active" }] }],
    seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active", assigned_staff_id: "staff-9" }] }],
    seeding_tasks: [
      { data: null }, // createTaskInternal's own duplicate-check: nothing yet
      { data: { id: "task-d1", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Share", destination_id: "d1", execution_account_id: "a1", assigned_staff_id: "staff-9", status: "Pending" } },
    ],
  });

  const result = await confirmDistribution("c1", { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: ["a1"] }, "manager-1", client);
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].destination_id, "d1");
  assert.equal(result.created[0].task_id, "task-d1");
  assert.equal(result.skipped.length, 0);
  assert.equal(result.failed.length, 0);
});

test("confirmDistribution: a stale preview where a selected destination is now Inactive is rejected outright — no tasks created", async () => {
  const { confirmDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [{ data: [{ id: "d1", label: "Nhóm A", status: "Inactive" }] }],
  });

  await assert.rejects(
    () => confirmDistribution("c1", { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: ["a1"] }, "manager-1", client),
    /không còn khả dụng/
  );
});

test("confirmDistribution: a selected execution account that no longer exists is rejected outright", async () => {
  const { confirmDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [{ data: [{ id: "d1", label: "Nhóm A", status: "Active" }] }],
    seeding_execution_accounts: [{ data: [] }], // submitted "a1" not found at all
  });

  await assert.rejects(
    () => confirmDistribution("c1", { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: ["a1"] }, "manager-1", client),
    /không còn khả dụng/
  );
});

test("confirmDistribution: an already-existing task for a destination is skipped honestly, not treated as a failure", async () => {
  const { confirmDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [
      {
        data: [
          { id: "d1", label: "Nhóm 1", status: "Active", created_at: "2026-08-01T00:00:00Z" },
          { id: "d2", label: "Nhóm 2", status: "Active", created_at: "2026-08-02T00:00:00Z" },
        ],
      },
    ],
    seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active", assigned_staff_id: "staff-9" }] }],
    seeding_tasks: [
      { data: null }, // d1: dup-check finds nothing
      { data: { id: "task-d1", campaign_target_id: "tg1", destination_id: "d1", status: "Pending" } }, // d1: insert succeeds
      { data: { id: "already-exists-d2", campaign_target_id: "tg1", destination_id: "d2", status: "Pending" } }, // d2: dup-check finds an existing row -> no insert attempted
    ],
  });

  const result = await confirmDistribution(
    "c1",
    { campaign_target_id: "tg1", destination_ids: ["d1", "d2"], execution_account_ids: ["a1"] },
    "manager-1",
    client
  );
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].destination_id, "d1");
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].destination_id, "d2");
  assert.equal(result.failed.length, 0);
});

test("confirmDistribution: honestly reports created task PKs even on a mixed created/skipped outcome (no rollback of already-created rows)", async () => {
  const { confirmDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({
    seeding_campaign_targets: [TARGET_ROW],
    seeding_destinations: [
      {
        data: [
          { id: "d1", label: "Nhóm 1", status: "Active", created_at: "2026-08-01T00:00:00Z" },
          { id: "d2", label: "Nhóm 2", status: "Active", created_at: "2026-08-02T00:00:00Z" },
        ],
      },
    ],
    seeding_execution_accounts: [{ data: [{ id: "a1", display_name: "Acct A", status: "Active", assigned_staff_id: "staff-9" }] }],
    seeding_tasks: [
      { data: null },
      { data: { id: "task-d1", destination_id: "d1", status: "Pending" } },
      { data: null, error: new Error("connection terminated unexpectedly") }, // d2: dup-check itself fails with a raw internal error
    ],
  });

  const result = await confirmDistribution(
    "c1",
    { campaign_target_id: "tg1", destination_ids: ["d1", "d2"], execution_account_ids: ["a1"] },
    "manager-1",
    client
  );
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].task_id, "task-d1", "the already-created row's PK must be reported even though d2 failed");
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].destination_id, "d2");
  assert.equal(result.failed[0].reason, "Không thể tạo task cho điểm đến này", "a raw internal error must never leak verbatim");
});

test("confirmDistribution: rejects an empty destination selection before any write", async () => {
  const { confirmDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({});
  await assert.rejects(
    () => confirmDistribution("c1", { campaign_target_id: "tg1", destination_ids: [], execution_account_ids: ["a1"] }, "manager-1", client),
    /Vui lòng chọn ít nhất một điểm đến/
  );
});

test("confirmDistribution: rejects an empty execution account selection before any write", async () => {
  const { confirmDistribution } = await import("./seedingDistribution.service");
  const client = makeClient({});
  await assert.rejects(
    () => confirmDistribution("c1", { campaign_target_id: "tg1", destination_ids: ["d1"], execution_account_ids: [] }, "manager-1", client),
    /Vui lòng chọn ít nhất một tài khoản thực hiện/
  );
});
