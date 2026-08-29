import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2K-BK — Direct Facebook Comment Publish. Page-only: Personal and
 * Group have no officially supported Graph API path (2K-BK feasibility
 * audit) and this module never attempts one. Mocks the Graph API +
 * Page-token lookups + target-context resolution entirely (not this
 * module's own concern — each already has its own test coverage), and
 * exercises only this module's own claim/publish/failure logic, via the
 * same per-table sequenced-fake-client pattern already used throughout
 * lib/seeding/*.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

class FakeFacebookGraphError extends Error {
  code?: number;
  constructor(message: string) {
    super(message);
    this.name = "FacebookGraphError";
  }
}

const createCommentMock = mock.fn(async (objectId: string, message: string, pageAccessToken: string) => {
  void objectId;
  void message;
  void pageAccessToken;
  return { id: "fb-comment-1" };
});
mock.module("@/lib/facebookTools/facebookGraphClient", {
  namedExports: {
    createComment: createCommentMock,
    FacebookGraphError: FakeFacebookGraphError,
  },
});

const getPageByFacebookPageIdMock = mock.fn(async (facebookPageId: string) =>
  facebookPageId === "fb-page-missing" ? null : { id: "page-row-1", facebook_page_id: facebookPageId, status: "Connected" }
);
const getDecryptedPageAccessTokenMock = mock.fn(async () => "fake-page-token");
mock.module("@/lib/facebookTools/facebookPage.service", {
  namedExports: {
    getPageByFacebookPageId: getPageByFacebookPageIdMock,
    getDecryptedPageAccessToken: getDecryptedPageAccessTokenMock,
  },
});

interface FakeTargetContext {
  campaign_id: string;
  source_type: "Page" | "Personal" | "Group";
  message: string | null;
  permalink_url: string | null;
}
const loadTargetContextMock = mock.fn(
  async (): Promise<FakeTargetContext> => ({
    campaign_id: "c1",
    source_type: "Page",
    message: "target message",
    permalink_url: null,
  })
);
mock.module("./seedingDistribution.service", {
  namedExports: { loadTargetContext: loadTargetContextMock },
});

interface FakeResult {
  data: unknown;
  error?: unknown;
}

const updateCalls: { table: string; payload: unknown }[] = [];

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
          if (prop === "update") {
            return (payload: unknown) => {
              updateCalls.push({ table, payload });
              return proxy;
            };
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

const PENDING_COMMENT_TASK = {
  id: "task-1",
  campaign_id: "c1",
  campaign_target_id: "target-1",
  action_type: "Comment",
  comment_text: "Mẫu này giá bao nhiêu vậy shop?",
  status: "Pending",
};

const CONNECTED_CAMPAIGN = { id: "c1", facebook_page_id: "fb-page-1", objective: "Tăng tương tác", status: "Active" };

function resetMocks() {
  updateCalls.length = 0;
  createCommentMock.mock.resetCalls();
  getPageByFacebookPageIdMock.mock.resetCalls();
  getDecryptedPageAccessTokenMock.mock.resetCalls();
  loadTargetContextMock.mock.resetCalls();
}

/** 1. Supported direct Page comment path succeeds. */
test("publishDirectComment: a Page-sourced Pending Comment task is published successfully, tagged with the real external_comment_id, and never invents a fake reason for a claim failure", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK },
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } },
      { data: { ...PENDING_COMMENT_TASK, status: "Done", external_comment_id: "fb-comment-1" } },
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: { facebook_post_id: "fb-post-1" } }],
  });

  const result = await publishDirectComment("task-1", "staff-1", client);

  assert.equal(result.status, "Done");
  assert.equal(result.external_comment_id, "fb-comment-1");
  assert.equal(createCommentMock.mock.callCount(), 1);
  assert.deepEqual(createCommentMock.mock.calls[0].arguments, ["fb-post-1", PENDING_COMMENT_TASK.comment_text, "fake-page-token"]);
});

/** 2. Unsupported source type cannot use direct comment API. */
test("publishDirectComment: a Personal-sourced target is rejected before ever calling the Graph API — never claims the task, never attempts a publish", async () => {
  resetMocks();
  loadTargetContextMock.mock.mockImplementationOnce(async () => ({
    campaign_id: "c1",
    source_type: "Personal" as const,
    message: "m",
    permalink_url: null,
  }));
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [{ data: PENDING_COMMENT_TASK }],
  });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /chỉ được hỗ trợ cho nguồn Page/);
  assert.equal(createCommentMock.mock.callCount(), 0);
  assert.equal(updateCalls.length, 0, "the task must never be claimed (moved to In Progress) for an unsupported source");
});

test("publishDirectComment: a Group-sourced target is likewise rejected, never calling the Graph API", async () => {
  resetMocks();
  loadTargetContextMock.mock.mockImplementationOnce(async () => ({
    campaign_id: "c1",
    source_type: "Group" as const,
    message: "m",
    permalink_url: null,
  }));
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_tasks: [{ data: PENDING_COMMENT_TASK }] });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /chỉ được hỗ trợ cho nguồn Page/);
  assert.equal(createCommentMock.mock.callCount(), 0);
});

/** 3. Missing/invalid capability/token is rejected safely. */
test("publishDirectComment: an unconnected Page (no facebook_pages row) is rejected safely — never claims the task, never calls the Graph API", async () => {
  resetMocks();
  getPageByFacebookPageIdMock.mock.mockImplementationOnce(async () => null);
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [{ data: PENDING_COMMENT_TASK }],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
  });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /chưa được kết nối/);
  assert.equal(createCommentMock.mock.callCount(), 0);
  assert.equal(updateCalls.length, 0);
});

test("publishDirectComment: a Page marked 'Reconnect Required' is rejected safely, before any claim/publish attempt", async () => {
  resetMocks();
  getPageByFacebookPageIdMock.mock.mockImplementationOnce(async () => ({ id: "page-row-1", facebook_page_id: "fb-page-1", status: "Reconnect Required" }));
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [{ data: PENDING_COMMENT_TASK }],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
  });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /cần được kết nối lại/);
  assert.equal(createCommentMock.mock.callCount(), 0);
  assert.equal(updateCalls.length, 0);
});

/** 4. API failure does not mark comment as posted. */
test("publishDirectComment: a Graph API failure after the task was claimed transitions it to Failed with the real error as result_note — never leaves it In Progress, never marks Done", async () => {
  resetMocks();
  createCommentMock.mock.mockImplementationOnce(async () => {
    throw new FakeFacebookGraphError("Missing permission pages_manage_posts");
  });
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [{ data: PENDING_COMMENT_TASK }, { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } }],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: { facebook_post_id: "fb-post-1" } }],
  });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /Missing permission pages_manage_posts/);

  const failUpdate = updateCalls.find((c) => c.table === "seeding_tasks" && (c.payload as { status?: string }).status === "Failed");
  assert.ok(failUpdate, "must have written a Failed status update");
  assert.equal((failUpdate!.payload as { result_note?: string }).result_note, "Missing permission pages_manage_posts");
  const doneUpdate = updateCalls.find((c) => c.table === "seeding_tasks" && (c.payload as { status?: string }).status === "Done");
  assert.equal(doneUpdate, undefined, "must never have written a Done status update");
});

/** 5. Success marks the comment correctly only after confirmed response. */
test("publishDirectComment: Done is only written after createComment resolves with a real id — the Done update payload carries the actual returned external_comment_id, not a guess", async () => {
  resetMocks();
  createCommentMock.mock.mockImplementationOnce(async () => ({ id: "fb-comment-real-id-999" }));
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK },
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } },
      { data: { ...PENDING_COMMENT_TASK, status: "Done", external_comment_id: "fb-comment-real-id-999" } },
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: { facebook_post_id: "fb-post-1" } }],
  });

  await publishDirectComment("task-1", "staff-1", client);

  const doneUpdate = updateCalls.find((c) => c.table === "seeding_tasks" && (c.payload as { status?: string }).status === "Done");
  assert.equal((doneUpdate!.payload as { external_comment_id?: string }).external_comment_id, "fb-comment-real-id-999");
});

/** 6. Duplicate concurrent/repeated submission is prevented. */
test("publishDirectComment: a task that is no longer Pending (already claimed by a concurrent/prior request) is rejected — the atomic claim update returns no row, never calls the Graph API a second time", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK },
      { data: null }, // the conditional `WHERE status = 'Pending'` claim update affected 0 rows
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
  });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /đang được đăng bởi một yêu cầu khác|đã được xử lý/);
  assert.equal(createCommentMock.mock.callCount(), 0, "must never call the Graph API when the claim itself failed");
});

/** 7. Existing generated comment content is not changed by publishing. */
test("publishDirectComment: the comment_text submitted to Facebook is exactly the task's existing comment_text, verbatim — publishing never rewrites/re-generates it", async () => {
  resetMocks();
  const customText = "Cho mình xin giá mẫu vòng này với ạ, cảm ơn shop!";
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [
      { data: { ...PENDING_COMMENT_TASK, comment_text: customText } },
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } },
      { data: { ...PENDING_COMMENT_TASK, status: "Done" } },
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: { facebook_post_id: "fb-post-1" } }],
  });

  await publishDirectComment("task-1", "staff-1", client);

  assert.equal(createCommentMock.mock.calls[0].arguments[1], customText);
});

test("publishDirectComment: a task with no comment_text is rejected before any claim/publish attempt", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_tasks: [{ data: { ...PENDING_COMMENT_TASK, comment_text: null } }] });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /chưa có nội dung comment/);
  assert.equal(createCommentMock.mock.callCount(), 0);
  assert.equal(updateCalls.length, 0);
});

test("publishDirectComment: a non-Comment task (Like/Share) is rejected", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_tasks: [{ data: { ...PENDING_COMMENT_TASK, action_type: "Like", comment_text: null } }] });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /chỉ áp dụng cho task loại Comment/);
  assert.equal(createCommentMock.mock.callCount(), 0);
});

test("publishDirectComment: a task with no campaign_target_id (legacy/no-target task) is rejected before any claim/publish attempt", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_tasks: [{ data: { ...PENDING_COMMENT_TASK, campaign_target_id: null } }] });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client), /không gắn với target nào/);
  assert.equal(createCommentMock.mock.callCount(), 0);
});

/** checkDirectCommentCapability — used by the read-only capability route the UI polls. */
test("checkDirectCommentCapability: AVAILABLE when the campaign's connected Page is healthy", async () => {
  resetMocks();
  const { checkDirectCommentCapability } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }] });

  const result = await checkDirectCommentCapability("c1", client);
  assert.equal(result.availability, "AVAILABLE");
});

test("checkDirectCommentCapability: UNAVAILABLE (with a human-readable reason) when the Page needs reconnecting", async () => {
  resetMocks();
  getPageByFacebookPageIdMock.mock.mockImplementationOnce(async () => ({ id: "page-row-1", facebook_page_id: "fb-page-1", status: "Reconnect Required" }));
  const { checkDirectCommentCapability } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }] });

  const result = await checkDirectCommentCapability("c1", client);
  assert.equal(result.availability, "UNAVAILABLE");
  assert.ok(result.reason && result.reason.length > 0);
});

test("checkDirectCommentCapability: UNAVAILABLE when the campaign itself cannot be found — never throws", async () => {
  resetMocks();
  const { checkDirectCommentCapability } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_campaigns: [{ data: null }] });

  const result = await checkDirectCommentCapability("missing-campaign", client);
  assert.equal(result.availability, "UNAVAILABLE");
});
