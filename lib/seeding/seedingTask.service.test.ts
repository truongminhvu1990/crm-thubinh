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
    seeding_tasks: [{ data: { id: "t6", campaign_id: "c1", campaign_target_id: "tg1", action_type: "Like", comment_text: null, status: "Pending" } }],
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
  seeding_campaigns: { name: string } | null;
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
