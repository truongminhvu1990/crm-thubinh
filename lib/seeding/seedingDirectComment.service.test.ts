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
const logActivityMock = mock.fn(async (entry: { staff_id: string | null; action: string; entity: string; entity_id: string | null }) => {
  void entry;
});
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: logActivityMock } });

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
  logActivityMock.mock.resetCalls();
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
  assert.ok(!("needsAcknowledgment" in result), "a COMPATIBLE/UNKNOWN target must publish directly, never require acknowledgment");

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
    seeding_campaign_targets: [{ data: { id: "target-1", manual_content_reference_id: null, facebook_page_posts: { facebook_page_id: "fb-page-1" } } }],
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

/** Phase 2K-BP — Reassign Connected Page. These prove capability/page
 * resolution always reads the campaign's CURRENT facebook_page_id live —
 * there is no cache anywhere in this module, so a reassignment (which
 * only ever writes that one column, seedingCampaign.service.ts) is
 * automatically picked up by the very next capability check or publish
 * attempt, with zero code change needed here. */

test("checkDirectCommentCapability: (G) resolves capability through whichever Page the campaign's facebook_page_id CURRENTLY points to, never a prior one", async () => {
  resetMocks();
  getPageByFacebookPageIdMock.mock.mockImplementationOnce(async (facebookPageId: string) => ({
    id: "page-row-b",
    facebook_page_id: facebookPageId,
    status: "Reconnect Required",
  }));
  const { checkDirectCommentCapability } = await import("./seedingDirectComment.service");
  // Simulates the campaign row AFTER a reassignment away from a formerly-healthy Page A.
  const client = makeClient({ seeding_campaigns: [{ data: { id: "c1", facebook_page_id: "fb-page-b", objective: "Tăng tương tác", status: "Active" } }] });

  const result = await checkDirectCommentCapability("c1", client);

  assert.equal(getPageByFacebookPageIdMock.mock.calls[0].arguments[0], "fb-page-b", "must resolve through the campaign's current facebook_page_id");
  assert.equal(result.availability, "UNAVAILABLE");
});

test("getCampaignPageInfo: returns the resolved Page's name/status and capability together", async () => {
  resetMocks();
  getPageByFacebookPageIdMock.mock.mockImplementationOnce(async (facebookPageId: string) => ({
    id: "page-row-1",
    facebook_page_id: facebookPageId,
    page_name: "Vòng Cẩm Thạch Jade A",
    status: "Connected",
  }));
  const { getCampaignPageInfo } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_campaigns: [{ data: { id: "c1", facebook_page_id: "fb-page-a", objective: "Tăng tương tác", status: "Active" } }] });

  const info = await getCampaignPageInfo("c1", client);

  assert.equal(info.facebook_page_id, "fb-page-a");
  assert.equal(info.page_name, "Vòng Cẩm Thạch Jade A");
  assert.equal(info.status, "Connected");
  assert.equal(info.capability.availability, "AVAILABLE");
});

test("getCampaignPageInfo: a campaign with no Page at all (manual-only) returns an honest all-null shape, never a guess", async () => {
  resetMocks();
  const { getCampaignPageInfo } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_campaigns: [{ data: { id: "c1", facebook_page_id: null, objective: "Tăng tương tác", status: "Active" } }] });

  const info = await getCampaignPageInfo("c1", client);

  assert.equal(info.facebook_page_id, null);
  assert.equal(info.page_name, null);
  assert.equal(info.status, null);
  assert.equal(info.capability.availability, "UNAVAILABLE");
  assert.ok(getPageByFacebookPageIdMock.mock.callCount() === 0, "must not attempt to resolve a Page when the campaign has none");
});

test("getCampaignPageInfo: a nonexistent campaign returns an honest UNAVAILABLE shape, never throws", async () => {
  resetMocks();
  const { getCampaignPageInfo } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_campaigns: [{ data: null }] });

  const info = await getCampaignPageInfo("missing-campaign", client);
  assert.equal(info.capability.availability, "UNAVAILABLE");
});

test("publishDirectComment: (J) a Pending task publishes against whichever Page the campaign's facebook_page_id CURRENTLY resolves to — no per-task Page snapshot exists, so a reassignment made before publish is picked up automatically", async () => {
  resetMocks();
  getPageByFacebookPageIdMock.mock.mockImplementationOnce(async (facebookPageId: string) => ({
    id: "page-row-b",
    facebook_page_id: facebookPageId,
    status: "Connected",
  }));
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK },
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } },
      { data: { ...PENDING_COMMENT_TASK, status: "Done" } },
    ],
    // Campaign now points to Page B (post-reassignment state) — the task itself carries no memory of Page A.
    seeding_campaigns: [{ data: { id: "c1", facebook_page_id: "fb-page-b", objective: "Tăng tương tác", status: "Active" } }],
    seeding_campaign_targets: [{ data: { facebook_post_id: "fb-post-1" } }],
  });

  await publishDirectComment("task-1", "staff-1", client);

  const pageResolutionCall = getPageByFacebookPageIdMock.mock.calls.find((c) => c.arguments[0] === "fb-page-b");
  assert.ok(pageResolutionCall, "must have resolved the token/capability through the campaign's current Page (B), not a stale one");
});

/** Phase 2K-BQ — Page/Target Compatibility Safety.
 *
 * getTargetCompatibilityForCampaign takes NO client-supplied compatibility
 * input at all (only a campaignId) — every result below is derived
 * entirely from server-side data (facebook_page_posts.facebook_page_id vs
 * seeding_campaigns.facebook_page_id, or manual_content_reference_id for
 * Personal/Group), which by construction proves the client can never fake
 * or override a compatibility status. */

test("getTargetCompatibilityForCampaign: (A) a Page-sourced target whose post belongs to the campaign's current Page is COMPATIBLE", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [
      { data: [{ id: "target-1", manual_content_reference_id: null, facebook_page_posts: { facebook_page_id: "fb-page-1" } }] },
    ],
  });

  const map = await getTargetCompatibilityForCampaign("c1", client);
  assert.equal(map["target-1"].compatibility, "COMPATIBLE");
});

test("getTargetCompatibilityForCampaign: (B) a Page-sourced target whose post belongs to a DIFFERENT Page than the campaign's current Page is INCOMPATIBLE, phrased as a risk not a guaranteed failure", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [
      { data: [{ id: "target-1", manual_content_reference_id: null, facebook_page_posts: { facebook_page_id: "fb-page-OTHER" } }] },
    ],
  });

  const map = await getTargetCompatibilityForCampaign("c1", client);
  assert.equal(map["target-1"].compatibility, "INCOMPATIBLE");
  assert.match(map["target-1"].reason ?? "", /có thể|khác/i);
  assert.doesNotMatch(map["target-1"].reason ?? "", /chắc chắn|sẽ thất bại/i);
});

test("getTargetCompatibilityForCampaign: (C) a campaign with no facebook_page_id at all yields UNKNOWN, never COMPATIBLE or INCOMPATIBLE", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_campaigns: [{ data: { id: "c1", facebook_page_id: null, objective: "x", status: "Active" } }],
    seeding_campaign_targets: [
      { data: [{ id: "target-1", manual_content_reference_id: null, facebook_page_posts: { facebook_page_id: "fb-page-1" } }] },
    ],
  });

  const map = await getTargetCompatibilityForCampaign("c1", client);
  assert.equal(map["target-1"].compatibility, "UNKNOWN");
});

test("getTargetCompatibilityForCampaign: (D) a Page-sourced target whose owning Page can't be resolved (missing join) yields UNKNOWN, never guessed from anything else", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: [{ id: "target-1", manual_content_reference_id: null, facebook_page_posts: null }] }],
  });

  const map = await getTargetCompatibilityForCampaign("c1", client);
  assert.equal(map["target-1"].compatibility, "UNKNOWN");
});

test("getTargetCompatibilityForCampaign: (E) a manual-content (Personal/Group) target is NOT_SUPPORTED regardless of the campaign's Page — never UNKNOWN merely because it has no owning Page", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: [{ id: "target-1", manual_content_reference_id: "manual-1", facebook_page_posts: null }] }],
  });

  const map = await getTargetCompatibilityForCampaign("c1", client);
  assert.equal(map["target-1"].compatibility, "NOT_SUPPORTED");
});

test("getTargetCompatibilityForCampaign: (F) computes every target in the campaign in one call, mixing all four states correctly", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [
      {
        data: [
          { id: "t-compatible", manual_content_reference_id: null, facebook_page_posts: { facebook_page_id: "fb-page-1" } },
          { id: "t-incompatible", manual_content_reference_id: null, facebook_page_posts: { facebook_page_id: "fb-page-OTHER" } },
          { id: "t-unknown", manual_content_reference_id: null, facebook_page_posts: null },
          { id: "t-not-supported", manual_content_reference_id: "manual-1", facebook_page_posts: null },
        ],
      },
    ],
  });

  const map = await getTargetCompatibilityForCampaign("c1", client);
  assert.equal(map["t-compatible"].compatibility, "COMPATIBLE");
  assert.equal(map["t-incompatible"].compatibility, "INCOMPATIBLE");
  assert.equal(map["t-unknown"].compatibility, "UNKNOWN");
  assert.equal(map["t-not-supported"].compatibility, "NOT_SUPPORTED");
});

test("getTargetCompatibilityForCampaign: (G) a nonexistent campaign returns an empty map, never throws", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_campaigns: [{ data: null }] });

  const map = await getTargetCompatibilityForCampaign("missing-campaign", client);
  assert.deepEqual(map, {});
});

test("getTargetCompatibilityForCampaign: (H) recalculates live from the campaign's CURRENT facebook_page_id — a Page reassignment (2K-BP) flips a previously-COMPATIBLE target to INCOMPATIBLE on the very next call, with no stale cache", async () => {
  resetMocks();
  const { getTargetCompatibilityForCampaign } = await import("./seedingDirectComment.service");
  const targetRow = { id: "target-1", manual_content_reference_id: null, facebook_page_posts: { facebook_page_id: "fb-page-1" } };

  const beforeReassign = makeClient({
    seeding_campaigns: [{ data: { id: "c1", facebook_page_id: "fb-page-1", objective: "x", status: "Active" } }],
    seeding_campaign_targets: [{ data: [targetRow] }],
  });
  const before = await getTargetCompatibilityForCampaign("c1", beforeReassign);
  assert.equal(before["target-1"].compatibility, "COMPATIBLE");

  const afterReassign = makeClient({
    seeding_campaigns: [{ data: { id: "c1", facebook_page_id: "fb-page-2", objective: "x", status: "Active" } }],
    seeding_campaign_targets: [{ data: [targetRow] }],
  });
  const after = await getTargetCompatibilityForCampaign("c1", afterReassign);
  assert.equal(after["target-1"].compatibility, "INCOMPATIBLE");
});

/** Phase 2K-BS — INCOMPATIBLE target server-side acknowledgment protocol.
 * publishDirectComment recomputes compatibility fresh on every call (via
 * checkTargetCompatibility, itself built on the same deriveTargetCompatibility
 * used by 2K-BQ's batch function) — the `acknowledged` boolean is the ONLY
 * thing ever trusted from the caller; no compatibility value, owning
 * Page, or override is ever accepted. */

const INCOMPATIBLE_TARGET_ROW = {
  id: "target-1",
  manual_content_reference_id: null,
  facebook_page_posts: { facebook_page_id: "fb-page-OTHER" },
  facebook_post_id: "fb-post-1",
};

test("publishDirectComment: (B) an INCOMPATIBLE target's first (unacknowledged) attempt returns needsAcknowledgment with a reason, never a published task", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [{ data: PENDING_COMMENT_TASK }],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: INCOMPATIBLE_TARGET_ROW }],
  });

  const result = await publishDirectComment("task-1", "staff-1", client);

  assert.ok("needsAcknowledgment" in result && result.needsAcknowledgment === true);
  assert.equal((result as { compatibility: string }).compatibility, "INCOMPATIBLE");
  assert.ok(((result as { reason: string }).reason ?? "").length > 0);
});

test("publishDirectComment: (C) an INCOMPATIBLE target's first attempt claims nothing — task stays Pending, no Graph API call, no activity log", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [{ data: PENDING_COMMENT_TASK }],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: INCOMPATIBLE_TARGET_ROW }],
  });

  await publishDirectComment("task-1", "staff-1", client);

  assert.equal(updateCalls.length, 0, "must never attempt the Pending -> In Progress claim before acknowledgment");
  assert.equal(createCommentMock.mock.callCount(), 0);
  assert.equal(logActivityMock.mock.callCount(), 0);
});

test("publishDirectComment: (D) an acknowledged INCOMPATIBLE target re-checks fresh, publishes when Graph API succeeds, and writes exactly one acknowledgment activity log", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK },
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } },
      { data: { ...PENDING_COMMENT_TASK, status: "Done", external_comment_id: "fb-comment-1" } },
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: INCOMPATIBLE_TARGET_ROW }],
  });

  const result = await publishDirectComment("task-1", "staff-1", client, true);

  assert.ok(!("needsAcknowledgment" in result));
  assert.equal(result.status, "Done");
  assert.equal(result.external_comment_id, "fb-comment-1");
  assert.equal(createCommentMock.mock.callCount(), 1);

  const ackLogs = logActivityMock.mock.calls.filter(
    (c) => (c.arguments[0] as { action?: string }).action === "seeding_task_direct_comment_incompatible_acknowledged"
  );
  assert.equal(ackLogs.length, 1, "exactly one acknowledgment log entry");
  assert.equal((ackLogs[0].arguments[0] as { entity_id?: string }).entity_id, "task-1");
});

test("publishDirectComment: (E) compatibility is recomputed fresh on the acknowledged call — if data changed to COMPATIBLE since the warning, it publishes normally and writes NO acknowledgment log", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");

  const firstAttemptClient = makeClient({
    seeding_tasks: [{ data: PENDING_COMMENT_TASK }],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: INCOMPATIBLE_TARGET_ROW }],
  });
  const firstResult = await publishDirectComment("task-1", "staff-1", firstAttemptClient);
  assert.ok("needsAcknowledgment" in firstResult && firstResult.needsAcknowledgment === true);

  resetMocks();
  const nowCompatibleTargetRow = { ...INCOMPATIBLE_TARGET_ROW, facebook_page_posts: { facebook_page_id: "fb-page-1" } };
  const confirmClient = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK },
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } },
      { data: { ...PENDING_COMMENT_TASK, status: "Done", external_comment_id: "fb-comment-2" } },
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: nowCompatibleTargetRow }],
  });

  const confirmResult = await publishDirectComment("task-1", "staff-1", confirmClient, true);

  assert.ok(!("needsAcknowledgment" in confirmResult));
  assert.equal(confirmResult.status, "Done");
  const ackLogs = logActivityMock.mock.calls.filter(
    (c) => (c.arguments[0] as { action?: string }).action === "seeding_task_direct_comment_incompatible_acknowledged"
  );
  assert.equal(ackLogs.length, 0, "no longer INCOMPATIBLE at the fresh re-check — nothing to acknowledge, so nothing is logged");
});

test("publishDirectComment: (F) NOT_SUPPORTED (Personal/Group) is rejected before any claim even when acknowledged=true — acknowledgment can never bypass the source-type gate", async () => {
  resetMocks();
  loadTargetContextMock.mock.mockImplementationOnce(async () => ({
    campaign_id: "c1",
    source_type: "Personal" as const,
    message: "m",
    permalink_url: null,
  }));
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({ seeding_tasks: [{ data: PENDING_COMMENT_TASK }] });

  await assert.rejects(() => publishDirectComment("task-1", "staff-1", client, true), /chỉ được hỗ trợ cho nguồn Page/);
  assert.equal(createCommentMock.mock.callCount(), 0);
  assert.equal(updateCalls.length, 0);
  assert.equal(logActivityMock.mock.callCount(), 0);
});

test("publishDirectComment: (G) UNKNOWN compatibility never requires acknowledgment — publishes directly on the first, unacknowledged attempt", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const unknownTargetRow = { id: "target-1", manual_content_reference_id: null, facebook_page_posts: null, facebook_post_id: "fb-post-1" };
  const client = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK },
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } },
      { data: { ...PENDING_COMMENT_TASK, status: "Done", external_comment_id: "fb-comment-3" } },
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: unknownTargetRow }],
  });

  const result = await publishDirectComment("task-1", "staff-1", client);

  assert.ok(!("needsAcknowledgment" in result), "UNKNOWN must never be gated behind acknowledgment");
  assert.equal(result.status, "Done");
  assert.equal(
    logActivityMock.mock.calls.filter((c) => (c.arguments[0] as { action?: string }).action === "seeding_task_direct_comment_incompatible_acknowledged").length,
    0
  );
});

test("publishDirectComment: (I) a second request against an already-claimed task never re-attempts the Graph API or writes a second acknowledgment log, even when both are acknowledged=true", async () => {
  resetMocks();
  const { publishDirectComment } = await import("./seedingDirectComment.service");
  const client = makeClient({
    seeding_tasks: [
      { data: PENDING_COMMENT_TASK }, // 1st call's getTaskById
      { data: { ...PENDING_COMMENT_TASK, status: "In Progress" } }, // 1st call wins the claim
      { data: { ...PENDING_COMMENT_TASK, status: "Done", external_comment_id: "fb-comment-1" } }, // 1st call's Done update
      { data: PENDING_COMMENT_TASK }, // 2nd call's getTaskById — read before the 1st call's claim committed
      { data: null }, // 2nd call's own claim affects 0 rows — already claimed
    ],
    seeding_campaigns: [{ data: CONNECTED_CAMPAIGN }],
    seeding_campaign_targets: [{ data: INCOMPATIBLE_TARGET_ROW }],
  });

  const first = await publishDirectComment("task-1", "staff-1", client, true);
  assert.ok(!("needsAcknowledgment" in first));
  assert.equal(first.status, "Done");

  await assert.rejects(
    () => publishDirectComment("task-1", "staff-2", client, true),
    /đang được đăng bởi một yêu cầu khác|đã được xử lý/
  );

  assert.equal(createCommentMock.mock.callCount(), 1, "Graph API must only ever be called once");
  const ackLogs = logActivityMock.mock.calls.filter(
    (c) => (c.arguments[0] as { action?: string }).action === "seeding_task_direct_comment_incompatible_acknowledged"
  );
  assert.equal(ackLogs.length, 1, "the losing request must never write a second acknowledgment log");
});
