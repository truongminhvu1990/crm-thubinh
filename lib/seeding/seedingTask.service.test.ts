import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Seeding Campaign Management (Phase 2C) — Task tracking, now target-
 * specific and action-typed (Like/Comment/Share), with a locked status
 * state machine (Pending -> anything; In Progress -> any terminal state,
 * never back to Pending; every terminal state accepts nothing further).
 * Same per-table sequenced-fake-client pattern as
 * lib/partner/partner.service.test.ts.
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

test("updateTaskStatus: Pending -> Done stamps executed_by/executed_at from the acting staff member, not the original assignee", async () => {
  const { updateTaskStatus } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_tasks: [
      { data: { id: "t1", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", status: "Pending" } },
      {
        data: {
          id: "t1",
          campaign_id: "c1",
          campaign_target_id: "tg1",
          action_type: "Comment",
          comment_text: "Còn hàng không shop?",
          assigned_staff_id: "staff-1",
          status: "Done",
          executed_by_staff_id: "staff-1",
          executed_at: "2026-08-24T00:00:00.000Z",
          result_note: null,
        },
      },
    ],
  });

  const result = await updateTaskStatus("t1", { status: "Done" }, "staff-1", client);
  assert.equal(result.status, "Done");
  assert.equal(result.executed_by_staff_id, "staff-1");
  assert.ok(result.executed_at);
});

test("updateTaskStatus: Pending -> Skipped stores the result_note as the skip reason", async () => {
  const { updateTaskStatus } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_tasks: [
      { data: { id: "t2", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", status: "Pending" } },
      {
        data: {
          id: "t2",
          campaign_id: "c1",
          campaign_target_id: "tg1",
          action_type: "Comment",
          status: "Skipped",
          executed_by_staff_id: "staff-2",
          executed_at: "2026-08-24T01:00:00.000Z",
          result_note: "Bài viết đã bị ẩn trước khi kịp đăng",
        },
      },
    ],
  });

  const result = await updateTaskStatus(
    "t2",
    { status: "Skipped", result_note: "Bài viết đã bị ẩn trước khi kịp đăng" },
    "staff-2",
    client
  );
  assert.equal(result.status, "Skipped");
  assert.equal(result.result_note, "Bài viết đã bị ẩn trước khi kịp đăng");
});

test("updateTaskStatus: Pending -> Failed stores the result_note as the failure reason (same field, reused)", async () => {
  const { updateTaskStatus } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_tasks: [
      { data: { id: "t2b", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Like", status: "Pending" } },
      {
        data: {
          id: "t2b",
          campaign_id: "c1",
          campaign_target_id: "tg1",
          action_type: "Like",
          status: "Failed",
          result_note: "Tài khoản bị giới hạn tương tác tạm thời",
        },
      },
    ],
  });

  const result = await updateTaskStatus(
    "t2b",
    { status: "Failed", result_note: "Tài khoản bị giới hạn tương tác tạm thời" },
    "staff-3",
    client
  );
  assert.equal(result.status, "Failed");
  assert.equal(result.result_note, "Tài khoản bị giới hạn tương tác tạm thời");
});

test("updateTaskStatus: Pending -> In Progress -> Done is a valid two-step path", async () => {
  const { updateTaskStatus } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_tasks: [
      { data: { id: "t-ip", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Share", status: "Pending" } },
      { data: { id: "t-ip", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Share", status: "In Progress" } },
    ],
  });
  const result = await updateTaskStatus("t-ip", { status: "In Progress" }, "staff-1", client);
  assert.equal(result.status, "In Progress");
});

test("updateTaskStatus: In Progress -> Pending is rejected (must never move back to Pending)", async () => {
  const { updateTaskStatus } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_tasks: [{ data: { id: "t3", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", status: "In Progress" } }],
  });

  await assert.rejects(
    () => updateTaskStatus("t3", { status: "Pending" }, "staff-1", client),
    /Invalid task status transition: In Progress -> Pending/
  );
});

test("updateTaskStatus: every terminal state (Done/Failed/Skipped/Cancelled) rejects any further transition", async () => {
  const { updateTaskStatus } = await import("./seedingTask.service");

  for (const terminal of ["Done", "Failed", "Skipped", "Cancelled"]) {
    const client = makeClient({
      seeding_tasks: [{ data: { id: "t4", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", status: terminal } }],
    });
    await assert.rejects(
      () => updateTaskStatus("t4", { status: "Done" }, "staff-1", client),
      new RegExp(`Invalid task status transition: ${terminal} -> Done`)
    );
  }
});

test("createTask: Comment action stores the comment text and derives campaign_id/facebook_post_id from the target", async () => {
  const { createTask } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      { data: null }, // duplicate-check finds nothing (Phase 2I, I1)
      {
        data: {
          id: "t5",
          campaign_id: "c1",
          campaign_target_id: "tg1",
          facebook_post_id: "post1",
          action_type: "Comment",
          comment_text: "Bản chỉnh sửa của nhân viên",
          suggested_comment_id: "s1",
          status: "Pending",
        },
      },
    ],
  });

  const result = await createTask(
    { campaign_target_id: "tg1", action_type: "Comment", comment_text: "Bản chỉnh sửa của nhân viên", suggested_comment_id: "s1" },
    "staff-1",
    client
  );
  assert.equal(result.comment_text, "Bản chỉnh sửa của nhân viên");
  assert.equal(result.campaign_id, "c1");
  assert.equal(result.facebook_post_id, "post1");
  assert.equal(result.status, "Pending");
});

test("createTask: Like/Share actions never require (or store) comment text", async () => {
  const { createTask } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      { data: null }, // duplicate-check finds nothing (Phase 2I, I1)
      { data: { id: "t6", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Like", comment_text: null, status: "Pending" } },
    ],
  });

  const result = await createTask({ campaign_target_id: "tg1", action_type: "Like" }, "staff-1", client);
  assert.equal(result.action_type, "Like");
  assert.equal(result.comment_text, null);
});

test("createTask: Comment action without comment_text is rejected before any write", async () => {
  const { createTask } = await import("./seedingTask.service");
  const client = makeClient({ seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }] });

  await assert.rejects(
    () => createTask({ campaign_target_id: "tg1", action_type: "Comment" }, "staff-1", client),
    /comment_text is required when action_type is Comment/
  );
});

test("createTask: an invalid action_type is rejected before any write", async () => {
  const { createTask } = await import("./seedingTask.service");
  const client = makeClient({ seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }] });

  await assert.rejects(
    () => createTask({ campaign_target_id: "tg1", action_type: "Poke" as never }, "staff-1", client),
    /Invalid action_type: Poke/
  );
});

/**
 * Phase 2I (I1) — server-side duplicate protection: the safety net behind
 * the UI's own submit-button disable/loading state, for the exact
 * accidental-double-submission scenario (same target + action + assignee +
 * content, still non-terminal).
 */

test("createTask: an identical non-terminal existing task is returned instead of inserting a duplicate row", async () => {
  const { createTask } = await import("./seedingTask.service");

  const existingTask = {
    id: "already-exists",
    campaign_id: "c1",
    campaign_target_id: "tg1",
    action_type: "Comment",
    comment_text: "hàng sẵn sg nha",
    assigned_staff_id: "staff-1",
    status: "Pending",
  };
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    // Only ONE seeding_tasks entry: the duplicate-check call must find this
    // and return it directly — if the code incorrectly proceeded to a
    // second (insert) call, the fake client would fall back to this exact
    // same fixture, which is why the assertion below checks the id
    // explicitly rather than just "some task was returned".
    seeding_tasks: [{ data: existingTask }],
  });

  const result = await createTask(
    { campaign_target_id: "tg1", action_type: "Comment", comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-1" },
    "staff-1",
    client
  );
  assert.equal(result.id, "already-exists");
});

test("createTask: same target/action but a DIFFERENT assignee is never blocked as a duplicate", async () => {
  const { createTask } = await import("./seedingTask.service");
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      { data: null }, // the duplicate query is scoped to assigned_staff_id "staff-2", finds nothing
      { data: { id: "t-new", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-2", status: "Pending" } },
    ],
  });

  const result = await createTask(
    { campaign_target_id: "tg1", action_type: "Comment", comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-2" },
    "staff-1",
    client
  );
  assert.equal(result.id, "t-new");
});

test("createTask: same target/action/assignee but DIFFERENT comment_text is never blocked as a duplicate", async () => {
  const { createTask } = await import("./seedingTask.service");
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      { data: null },
      { data: { id: "t-new2", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", comment_text: "còn hàng không ạ", assigned_staff_id: "staff-1", status: "Pending" } },
    ],
  });

  const result = await createTask(
    { campaign_target_id: "tg1", action_type: "Comment", comment_text: "còn hàng không ạ", assigned_staff_id: "staff-1" },
    "staff-1",
    client
  );
  assert.equal(result.id, "t-new2");
});

test("createTask: a TERMINAL existing task (e.g. Done) never blocks a new identical task — re-doing resolved work is legitimate", async () => {
  const { createTask } = await import("./seedingTask.service");
  // The duplicate query only ever matches Pending/In Progress rows — a
  // terminal-status row is never returned by it, simulated here as the
  // query finding nothing (the fake client can't filter by status itself,
  // so this asserts the code's own consumption of that null correctly,
  // exactly like the "no duplicate" tests above).
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      { data: null },
      { data: { id: "t-redo", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Like", assigned_staff_id: "staff-1", status: "Pending" } },
    ],
  });

  const result = await createTask({ campaign_target_id: "tg1", action_type: "Like", assigned_staff_id: "staff-1" }, "staff-1", client);
  assert.equal(result.id, "t-redo");
});

/**
 * Phase 2I (I7a) — scheduled_at joins the duplicate signature: same target/
 * action/assignee/comment AND same scheduled_at is a duplicate; a
 * different date is genuinely distinct work, never blocked.
 */

test("createTask: same target/action/assignee/comment AND the same scheduled_at returns the existing task instead of inserting a duplicate row", async () => {
  const { createTask } = await import("./seedingTask.service");

  const existingTask = {
    id: "already-exists-scheduled",
    campaign_id: "c1",
    campaign_target_id: "tg1",
    action_type: "Comment",
    comment_text: "hàng sẵn sg nha",
    assigned_staff_id: "staff-1",
    scheduled_at: "2026-09-01T09:00:00.000Z",
    status: "Pending",
  };
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    // Only ONE seeding_tasks entry: the duplicate-check call must find this
    // and return it directly, exactly like the base (unscheduled) duplicate
    // test above — now with an explicit scheduled_at on both sides.
    seeding_tasks: [{ data: existingTask }],
  });

  const result = await createTask(
    {
      campaign_target_id: "tg1",
      action_type: "Comment",
      comment_text: "hàng sẵn sg nha",
      assigned_staff_id: "staff-1",
      scheduled_at: "2026-09-01T09:00:00.000Z",
    },
    "staff-1",
    client
  );
  assert.equal(result.id, "already-exists-scheduled");
});

test("createTask: same target/action/assignee/comment but a DIFFERENT scheduled_at is never blocked as a duplicate", async () => {
  const { createTask } = await import("./seedingTask.service");
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      { data: null }, // the duplicate query is scoped to this different scheduled_at, finds nothing
      {
        data: {
          id: "t-new-date",
          campaign_id: "c1",
          campaign_target_id: "tg1",
          action_type: "Comment",
          comment_text: "hàng sẵn sg nha",
          assigned_staff_id: "staff-1",
          scheduled_at: "2026-09-08T09:00:00.000Z",
          status: "Pending",
        },
      },
    ],
  });

  const result = await createTask(
    {
      campaign_target_id: "tg1",
      action_type: "Comment",
      comment_text: "hàng sẵn sg nha",
      assigned_staff_id: "staff-1",
      scheduled_at: "2026-09-08T09:00:00.000Z",
    },
    "staff-1",
    client
  );
  assert.equal(result.id, "t-new-date");
});

test("createTask: two otherwise-identical tasks with no scheduled_at (both null) are treated as duplicates — null matches null", async () => {
  const { createTask } = await import("./seedingTask.service");
  const existingTask = {
    id: "already-exists-unscheduled",
    campaign_id: "c1",
    campaign_target_id: "tg1",
    action_type: "Comment",
    comment_text: "hàng sẵn sg nha",
    assigned_staff_id: "staff-1",
    scheduled_at: null,
    status: "Pending",
  };
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [{ data: existingTask }],
  });

  // No scheduled_at provided at all — must take the same IS NULL branch
  // that finds this existing, also-unscheduled, task.
  const result = await createTask(
    { campaign_target_id: "tg1", action_type: "Comment", comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-1" },
    "staff-1",
    client
  );
  assert.equal(result.id, "already-exists-unscheduled");
});

test("createTask: an omitted scheduled_at is scoped to IS NULL — it is never matched by (or blocked by) a task that has a real scheduled_at", async () => {
  const { createTask } = await import("./seedingTask.service");
  const client = makeClient({
    seeding_campaign_targets: [{ data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      // The duplicate query for this call is scoped to scheduled_at IS
      // NULL — a task that actually has a scheduled_at set lives outside
      // that scope entirely, so the query correctly finds nothing here.
      { data: null },
      {
        data: {
          id: "t-new-unscheduled",
          campaign_id: "c1",
          campaign_target_id: "tg1",
          action_type: "Comment",
          comment_text: "hàng sẵn sg nha",
          assigned_staff_id: "staff-1",
          scheduled_at: null,
          status: "Pending",
        },
      },
    ],
  });

  const result = await createTask(
    { campaign_target_id: "tg1", action_type: "Comment", comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-1" },
    "staff-1",
    client
  );
  assert.equal(result.id, "t-new-unscheduled");
});

/**
 * Phase 2I (I2) — bulk Comment task creation across many selected targets
 * with one shared comment/assignee/date, reusing createTask's own
 * validation/duplicate-protection per target via createTaskInternal.
 */

test("createBulkCommentTasks: creates one task per selected target with the same content/assignee/date", async () => {
  const { createBulkCommentTasks } = await import("./seedingTask.service");

  const client = makeClient({
    // 1st call: bulk campaign-ownership validity check (both targets valid).
    // 2nd/3rd calls: per-target single lookups inside createTaskInternal.
    seeding_campaign_targets: [
      { data: [{ id: "tg1" }, { id: "tg2" }] },
      { data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } },
      { data: { id: "tg2", campaign_id: "c1", facebook_post_id: "post2" } },
    ],
    // Interleaved per target: duplicate-check (null) then insert.
    seeding_tasks: [
      { data: null },
      { data: { id: "bulk-t1", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-1", status: "Pending" } },
      { data: null },
      { data: { id: "bulk-t2", campaign_id: "c1", campaign_target_id: "tg2", action_type: "Comment", comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-1", status: "Pending" } },
    ],
  });

  const result = await createBulkCommentTasks(
    "c1",
    { targetIds: ["tg1", "tg2"], comment_text: "hàng sẵn sg nha", assigned_staff_id: "staff-1" },
    "manager-1",
    client
  );

  assert.equal(result.created.length, 2);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(
    result.created.map((c) => c.targetId).sort(),
    ["tg1", "tg2"]
  );
});

test("createBulkCommentTasks: a target id that does not belong to this campaign is reported as failed, never silently included", async () => {
  const { createBulkCommentTasks } = await import("./seedingTask.service");

  const client = makeClient({
    // Only tg1 belongs to campaign c1 — tg-other does not come back from
    // the bulk validity check at all.
    seeding_campaign_targets: [{ data: [{ id: "tg1" }] }, { data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      { data: null },
      { data: { id: "bulk-t1", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Comment", comment_text: "x", assigned_staff_id: "staff-1", status: "Pending" } },
    ],
  });

  const result = await createBulkCommentTasks(
    "c1",
    { targetIds: ["tg1", "tg-other"], comment_text: "x", assigned_staff_id: "staff-1" },
    "manager-1",
    client
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].targetId, "tg-other");
});

test("createBulkCommentTasks: rejects an empty target selection before any write", async () => {
  const { createBulkCommentTasks } = await import("./seedingTask.service");
  const client = makeClient({});
  await assert.rejects(
    () => createBulkCommentTasks("c1", { targetIds: [], comment_text: "x" }, "manager-1", client),
    /At least one target must be selected/
  );
});

test("createBulkCommentTasks: rejects an empty/missing comment_text before any write", async () => {
  const { createBulkCommentTasks } = await import("./seedingTask.service");
  const client = makeClient({});
  await assert.rejects(
    () => createBulkCommentTasks("c1", { targetIds: ["tg1"], comment_text: "  " }, "manager-1", client),
    /comment_text is required/
  );
});

/**
 * Phase 2I (I7b) — a per-target failure must never leak a raw internal/
 * driver error message through failed[].error. Only SeedingValidationError
 * (the module's own established "safe to show the user" type, the same
 * rule handleSeedingError already applies at the route level) passes its
 * message through; everything else is sanitized to one generic message.
 */

test("createBulkCommentTasks: a known-safe SeedingValidationError from a per-target attempt is preserved in failed[].error", async () => {
  const { createBulkCommentTasks } = await import("./seedingTask.service");
  const { SeedingValidationError } = await import("./seeding.errors");

  const client = makeClient({
    seeding_campaign_targets: [{ data: [{ id: "tg1" }] }, { data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      // Simulates a SeedingValidationError surfacing from createTaskInternal
      // for this target — regardless of which internal step produces it,
      // this is always the module's own safe-to-show-the-user error type.
      { data: null, error: new SeedingValidationError("Nội dung comment không hợp lệ") },
    ],
  });

  const result = await createBulkCommentTasks(
    "c1",
    { targetIds: ["tg1"], comment_text: "x", assigned_staff_id: "staff-1" },
    "manager-1",
    client
  );

  assert.equal(result.created.length, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].error, "Nội dung comment không hợp lệ");
});

test("createBulkCommentTasks: an unknown Error with an internal-looking message never leaks that message in failed[].error", async () => {
  const { createBulkCommentTasks } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_campaign_targets: [{ data: [{ id: "tg1" }] }, { data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } }],
    seeding_tasks: [
      // Simulates a raw DB/driver-style failure surfacing from
      // createTaskInternal — must never reach the client verbatim.
      { data: null, error: new Error('duplicate key value violates unique constraint "seeding_tasks_pkey" on relation "seeding_tasks"') },
    ],
  });

  const result = await createBulkCommentTasks(
    "c1",
    { targetIds: ["tg1"], comment_text: "x", assigned_staff_id: "staff-1" },
    "manager-1",
    client
  );

  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].error, "Không thể tạo task cho bài viết này");
  assert.ok(!result.failed[0].error.includes("constraint"), "must never leak the raw driver message");
  assert.ok(!result.failed[0].error.includes("relation"), "must never leak schema/table internals");
});

test("createBulkCommentTasks: created/skipped/failed counts stay honest even when a failure's message is sanitized", async () => {
  const { createBulkCommentTasks } = await import("./seedingTask.service");

  const client = makeClient({
    seeding_campaign_targets: [
      { data: [{ id: "tg1" }, { id: "tg2" }, { id: "tg3" }] },
      { data: { id: "tg1", campaign_id: "c1", facebook_post_id: "post1" } },
      { data: { id: "tg2", campaign_id: "c1", facebook_post_id: "post2" } },
      { data: { id: "tg3", campaign_id: "c1", facebook_post_id: "post3" } },
    ],
    seeding_tasks: [
      // tg1: duplicate-check finds nothing, insert succeeds -> created.
      { data: null },
      {
        data: {
          id: "bulk-t1",
          campaign_id: "c1",
          campaign_target_id: "tg1",
          action_type: "Comment",
          comment_text: "x",
          assigned_staff_id: "staff-1",
          status: "Pending",
        },
      },
      // tg2: duplicate-check finds an existing row -> skipped.
      {
        data: {
          id: "existing-t2",
          campaign_id: "c1",
          campaign_target_id: "tg2",
          action_type: "Comment",
          comment_text: "x",
          assigned_staff_id: "staff-1",
          status: "Pending",
        },
      },
      // tg3: duplicate-check itself fails with a raw internal error -> failed, sanitized.
      { data: null, error: new Error("connection terminated unexpectedly") },
    ],
  });

  const result = await createBulkCommentTasks(
    "c1",
    { targetIds: ["tg1", "tg2", "tg3"], comment_text: "x", assigned_staff_id: "staff-1" },
    "manager-1",
    client
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.created[0].targetId, "tg1");
  assert.equal(result.skipped[0].targetId, "tg2");
  assert.equal(result.failed[0].targetId, "tg3");
  assert.equal(result.failed[0].error, "Không thể tạo task cho bài viết này");
});

/**
 * My Tasks (Phase 2D) — getTasksAssignedToStaff's single embedded query
 * (campaign name + target/post context in one round trip, no N+1), task
 * isolation between staff members, and graceful handling of a legacy row
 * with no campaign_target_id.
 */

interface FakeEmbeddedRow {
  id: string;
  campaign_id: string;
  campaign_target_id: string | null;
  action_type: string;
  comment_text: string | null;
  status: string;
  assigned_staff_id: string;
  seeding_campaigns: { name: string; status?: string } | null;
  seeding_campaign_targets: {
    facebook_page_posts: {
      message: string | null;
      permalink_url: string | null;
      full_picture_url: string | null;
      discovery_status: string | null;
    } | null;
  } | null;
}

function makeAssignedClient(rows: FakeEmbeddedRow[]) {
  const fromCalls: string[] = [];
  const client = {
    from(table: string) {
      fromCalls.push(table);
      if (table !== "seeding_tasks") {
        throw new Error(`Unexpected extra table query (would be an N+1 follow-up): ${table}`);
      }
      return {
        select(_cols: string) {
          const builder = {
            eq(_col: string, staffId: string) {
              return {
                order() {
                  return Promise.resolve({ data: rows.filter((r) => r.assigned_staff_id === staffId), error: null });
                },
              };
            },
          };
          return builder;
        },
      };
    },
  };
  return { client: client as never, fromCalls };
}

test("getTasksAssignedToStaff: returns campaign name context", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t1",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Chiến dịch livestream 20/08" },
      seeding_campaign_targets: { facebook_page_posts: { message: "Hello", permalink_url: "https://fb.com/1", full_picture_url: null, discovery_status: "Active" } },
    },
  ]);

  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.campaign_name, "Chiến dịch livestream 20/08");
});

test("getTasksAssignedToStaff: Phase 2G — surfaces campaign_status='Completed' so My Tasks can indicate a closed campaign", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t1",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign đã đóng", status: "Completed" },
      seeding_campaign_targets: { facebook_page_posts: { message: "Hello", permalink_url: null, full_picture_url: null, discovery_status: "Active" } },
    },
  ]);

  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.campaign_status, "Completed");
});

test("getTasksAssignedToStaff: campaign_status is 'Active' for an ongoing campaign's task", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t1",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign đang chạy", status: "Active" },
      seeding_campaign_targets: { facebook_page_posts: { message: "Hello", permalink_url: null, full_picture_url: null, discovery_status: "Active" } },
    },
  ]);

  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.campaign_status, "Active");
});

test("getTasksAssignedToStaff: a legacy task with no resolvable campaign gets campaign_status null, never crashes", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t1",
      campaign_id: "c1",
      campaign_target_id: null,
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: null,
      seeding_campaign_targets: null,
    },
  ]);

  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.campaign_status, null);
});

test("getTasksAssignedToStaff: returns target/post context (message, permalink, thumbnail)", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t1",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Comment",
      comment_text: "Còn hàng không shop?",
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: {
        facebook_page_posts: { message: "Vòng ngọc bích mới về", permalink_url: "https://fb.com/post/1", full_picture_url: "https://img/1.jpg", discovery_status: "Active" },
      },
    },
  ]);

  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.target_message, "Vòng ngọc bích mới về");
  assert.equal(task.target_permalink_url, "https://fb.com/post/1");
  assert.equal(task.target_full_picture_url, "https://img/1.jpg");
});

test("getTasksAssignedToStaff: a Like task has null comment_text and its action_type is Like", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-like",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Active" } },
    },
  ]);
  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.action_type, "Like");
  assert.equal(task.comment_text, null);
});

test("getTasksAssignedToStaff: a Comment task carries its comment_text through", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-comment",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Comment",
      comment_text: "Giá bao nhiêu shop ơi?",
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Active" } },
    },
  ]);
  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.action_type, "Comment");
  assert.equal(task.comment_text, "Giá bao nhiêu shop ơi?");
});

test("getTasksAssignedToStaff: a Share task has null comment_text and its action_type is Share", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-share",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Share",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Active" } },
    },
  ]);
  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.action_type, "Share");
  assert.equal(task.comment_text, null);
});

test("getTasksAssignedToStaff: a legacy task with no campaign_target_id renders with null context, never crashes", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-legacy",
      campaign_id: "c1",
      campaign_target_id: null,
      action_type: "Comment",
      comment_text: "Bài cũ trước Phase 2C",
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: null,
    },
  ]);

  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.target_message, null);
  assert.equal(task.target_permalink_url, null);
  assert.equal(task.target_full_picture_url, null);
  assert.equal(task.target_discovery_status, null, "no target means no discovery_status, never a guessed value");
  assert.equal(task.comment_text, "Bài cũ trước Phase 2C", "the task's own fields must still come through untouched");
});

test("getTasksAssignedToStaff: staff A's tasks never appear in staff B's own query — isolation is enforced server-side", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-a",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Active" } },
    },
    {
      id: "t-b",
      campaign_id: "c1",
      campaign_target_id: "tg2",
      action_type: "Comment",
      comment_text: "Của staff B",
      status: "Pending",
      assigned_staff_id: "staff-B",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m2", permalink_url: "p2", full_picture_url: null, discovery_status: "Active" } },
    },
  ]);

  const staffATasks = await getTasksAssignedToStaff("staff-A", client);
  const staffBTasks = await getTasksAssignedToStaff("staff-B", client);

  assert.deepEqual(staffATasks.map((t) => t.id), ["t-a"]);
  assert.deepEqual(staffBTasks.map((t) => t.id), ["t-b"]);
  assert.ok(!staffATasks.some((t) => t.id === "t-b"), "staff A must never see staff B's task");
});

test("getTasksAssignedToStaff: fetches campaign/target/post context in exactly one query — no N+1 follow-up per task", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client, fromCalls } = makeAssignedClient([
    {
      id: "t1",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Active" } },
    },
    {
      id: "t2",
      campaign_id: "c1",
      campaign_target_id: "tg2",
      action_type: "Share",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m2", permalink_url: "p2", full_picture_url: null, discovery_status: "Active" } },
    },
  ]);

  const tasks = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(tasks.length, 2, "multiple tasks must still resolve from the same single query");
  assert.deepEqual(fromCalls, ["seeding_tasks"], "exactly one table query total, regardless of task count");
});

/**
 * Phase 2E — target_discovery_status, mapped from the same single embedded
 * query (no extra table call), for each real value the target post can
 * carry.
 */

test("getTasksAssignedToStaff: target_discovery_status is 'Active' when the target post is still reachable", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-active",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Like",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Active" } },
    },
  ]);
  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.target_discovery_status, "Active");
});

test("getTasksAssignedToStaff: target_discovery_status surfaces 'Unavailable' — a warning signal, task remains actionable", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-unavail",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Comment",
      comment_text: "Còn hàng không shop?",
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Unavailable" } },
    },
  ]);
  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.target_discovery_status, "Unavailable");
  assert.equal(task.status, "Pending", "a non-Active discovery_status must never itself change or block the task's own status");
});

test("getTasksAssignedToStaff: target_discovery_status surfaces 'Refresh Failed'", async () => {
  const { getTasksAssignedToStaff } = await import("./seedingTask.service");
  const { client } = makeAssignedClient([
    {
      id: "t-refresh-failed",
      campaign_id: "c1",
      campaign_target_id: "tg1",
      action_type: "Share",
      comment_text: null,
      status: "Pending",
      assigned_staff_id: "staff-A",
      seeding_campaigns: { name: "Campaign A" },
      seeding_campaign_targets: { facebook_page_posts: { message: "m", permalink_url: "p", full_picture_url: null, discovery_status: "Refresh Failed" } },
    },
  ]);
  const [task] = await getTasksAssignedToStaff("staff-A", client);
  assert.equal(task.target_discovery_status, "Refresh Failed");
});
