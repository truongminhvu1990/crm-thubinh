import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2F — AI-Powered Evidence Reconciliation. Mocks the Facebook Graph
 * client, Page connection service, and Campaign lookup entirely (not this
 * module's concern); the AI call is injected directly via reconcileNextBatch's
 * own aiMatchFn parameter (same injectable-collaborator convention as
 * generateCommentSuggestions' requestFn), never mocking @anthropic-ai/sdk.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

let commentsToReturn: { id: string; from?: { id: string; name: string }; message?: string }[] = [];
let hasMoreToReturn = false;
let fetchShouldThrow: Error | null = null;
const getPostCommentsBoundedSampleMock = mock.fn(async () => {
  if (fetchShouldThrow) throw fetchShouldThrow;
  return { comments: commentsToReturn, hasMore: hasMoreToReturn };
});
class FakeFacebookGraphError extends Error {
  requiresReconnect: boolean;
  constructor(message: string, requiresReconnect = false) {
    super(message);
    this.requiresReconnect = requiresReconnect;
  }
}
mock.module("@/lib/facebookTools/facebookGraphClient", {
  namedExports: {
    getPostCommentsBoundedSample: getPostCommentsBoundedSampleMock,
    FacebookGraphError: FakeFacebookGraphError,
  },
});

const markPageReconnectRequiredMock = mock.fn(async () => {});
mock.module("@/lib/facebookTools/facebookPage.service", {
  namedExports: {
    getPageByFacebookPageId: async () => ({ id: "page-row-1", facebook_page_id: "fb-page-1" }),
    getDecryptedPageAccessToken: async () => "fake-token",
    markPageReconnectRequired: markPageReconnectRequiredMock,
    isReconnectRequiredError: (error: unknown) => error instanceof FakeFacebookGraphError && error.requiresReconnect,
  },
});

mock.module("./seedingCampaign.service", {
  namedExports: {
    getCampaignById: async (id: string) => ({ id, facebook_page_id: "fb-page-1" }),
  },
});

// node:test's mock.module registrations above must be visible before this
// module (and its own imports) load — dynamic import() inside each test,
// not a top-level await, matches this codebase's existing convention (see
// facebookHideJob.service.test.ts) and avoids esbuild's cjs-output
// top-level-await restriction.
async function loadModule() {
  return import("./seedingEvidenceReconciliation.service");
}
async function loadDeterministic() {
  return import("./seedingEvidenceMatch.deterministic");
}

interface FakeRow {
  [key: string]: unknown;
}

/** A permissive, chainable fake mirroring PostgrestFilterBuilder's thenable
 * shape: every filter method (.eq/.not/.in/.order) returns itself, and
 * awaiting resolves to the table's configured select data. .upsert()/
 * .insert()/.update() are recorded for assertions (e.g. proving
 * seeding_tasks.update is never called) and resolve to {error: null}. */
function makeClient(selectData: Record<string, FakeRow[]>) {
  const upserts: { table: string; row: FakeRow }[] = [];
  const inserts: { table: string; row: FakeRow }[] = [];
  const updates: { table: string; changes: FakeRow }[] = [];

  function chainable(resolveValue: unknown) {
    const builder: Record<string, unknown> = {};
    ["eq", "not", "in", "order", "gt", "limit", "select"].forEach((method) => {
      builder[method] = () => builder;
    });
    builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolveValue).then(resolve, reject);
    builder.maybeSingle = () => Promise.resolve(resolveValue);
    return builder;
  }

  const client = {
    from(table: string) {
      return {
        select: () => chainable({ data: selectData[table] ?? [], error: null }),
        upsert: (row: FakeRow) => {
          upserts.push({ table, row });
          return chainable({ error: null });
        },
        insert: (row: FakeRow) => {
          inserts.push({ table, row });
          return chainable({ error: null });
        },
        update: (changes: FakeRow) => {
          updates.push({ table, changes });
          return chainable({ error: null });
        },
      };
    },
    __upserts: upserts,
    __inserts: inserts,
    __updates: updates,
  };
  return client as never;
}

test.beforeEach(() => {
  commentsToReturn = [];
  hasMoreToReturn = false;
  fetchShouldThrow = null;
  getPostCommentsBoundedSampleMock.mock.resetCalls();
  markPageReconnectRequiredMock.mock.resetCalls();
});

test("isTaskEligibleForReconciliation: never-checked task is eligible", async () => {
  const { isTaskEligibleForReconciliation } = await loadModule();
  assert.equal(isTaskEligibleForReconciliation("hello", undefined), true);
});

test("isTaskEligibleForReconciliation: resolved + unchanged text is NOT eligible (idempotency)", async () => {
  const { isTaskEligibleForReconciliation } = await loadModule();
  const { hashCommentText } = await loadDeterministic();
  const existing = { result: "Exact Match" as const, comment_text_hash: hashCommentText("hello") };
  assert.equal(isTaskEligibleForReconciliation("hello", existing), false);
});

test("isTaskEligibleForReconciliation: changed comment_text re-enables eligibility", async () => {
  const { isTaskEligibleForReconciliation } = await loadModule();
  const { hashCommentText } = await loadDeterministic();
  const existing = { result: "Exact Match" as const, comment_text_hash: hashCommentText("old text") };
  assert.equal(isTaskEligibleForReconciliation("new text", existing), true);
});

test("isTaskEligibleForReconciliation: transient-failure results are auto-eligible even with unchanged text", async () => {
  const { isTaskEligibleForReconciliation } = await loadModule();
  const { hashCommentText } = await loadDeterministic();
  for (const result of ["Partial Evidence", "Evidence Unavailable", "Reconnect Required"] as const) {
    const existing = { result, comment_text_hash: hashCommentText("hello") };
    assert.equal(isTaskEligibleForReconciliation("hello", existing), true, `${result} should be auto-eligible`);
  }
});

test("isTaskEligibleForReconciliation: Ambiguous with unchanged text is NOT auto-eligible (needs explicit recheck)", async () => {
  const { isTaskEligibleForReconciliation } = await loadModule();
  const { hashCommentText } = await loadDeterministic();
  const existing = { result: "Ambiguous" as const, comment_text_hash: hashCommentText("hello") };
  assert.equal(isTaskEligibleForReconciliation("hello", existing), false);
});

test("reconcileNextBatch: exact match resolves without ever calling AI", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "sản phẩm đẹp quá" }];
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm đẹp quá" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "high" as const, reasoning: "x" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);

  assert.equal(result.processed, 1);
  assert.equal(result.results[0].result, "Exact Match");
  assert.equal(aiMatchFn.mock.calls.length, 0, "AI must not be called when deterministic matching already resolved it");
  assert.equal((client as never as { __updates: unknown[] }).__updates.length, 0, "seeding_tasks must never be written by this service");
});

test("reconcileNextBatch: no deterministic match, AI high confidence -> AI Match (High Confidence)", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "hoi thong tin gia san pham nay" }];
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm này giá bao nhiêu vậy shop" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "high" as const, reasoning: "paraphrase match" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);

  assert.equal(result.results[0].result, "AI Match (High Confidence)");
  assert.equal(aiMatchFn.mock.calls.length, 1);
});

test("reconcileNextBatch: AI medium/low confidence -> Ambiguous (exception queue, never auto-resolved)", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "một nội dung gần giống nhưng không chắc" }];
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm này giá bao nhiêu" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "medium" as const, reasoning: "uncertain" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(result.results[0].result, "Ambiguous");
});

test("reconcileNextBatch: AI null bestMatchIndex -> Ambiguous even if confidence is high", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "hoàn toàn không liên quan" }];
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm này giá bao nhiêu" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: null, confidence: "high" as const, reasoning: "no candidate matches" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(result.results[0].result, "Ambiguous");
});

test("reconcileNextBatch: AI call failure -> Evidence Unavailable, does not throw, does not block other tasks", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "một nội dung nào đó" }];
  const client = makeClient({
    seeding_tasks: [
      { id: "t1", campaign_target_id: "target-1", comment_text: "text hoàn toàn khác" },
      { id: "t2", campaign_target_id: "target-1", comment_text: "text khác nữa" },
    ],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => {
    throw new Error("Claude API timeout");
  });

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(result.processed, 2);
  assert.ok(result.results.every((r) => r.result === "Evidence Unavailable"));
});

test("reconcileNextBatch: no candidates on the post -> Not Found, AI never called", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [];
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm đẹp" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "high" as const, reasoning: "x" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(result.results[0].result, "Not Found");
  assert.equal(aiMatchFn.mock.calls.length, 0);
});

test("reconcileNextBatch: hasMore=true -> Partial Evidence, AI never called (never a false Not Found)", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "không liên quan" }];
  hasMoreToReturn = true;
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm đẹp" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "high" as const, reasoning: "x" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(result.results[0].result, "Partial Evidence");
  assert.equal(aiMatchFn.mock.calls.length, 0, "AI must never evaluate an incomplete sample");
});

test("reconcileNextBatch: reconnect-required Graph error -> Reconnect Required per task, marks page once", async () => {
  const { reconcileNextBatch } = await loadModule();
  fetchShouldThrow = new FakeFacebookGraphError("Invalid OAuth access token", true);
  const client = makeClient({
    seeding_tasks: [
      { id: "t1", campaign_target_id: "target-1", comment_text: "a" },
      { id: "t2", campaign_target_id: "target-1", comment_text: "b" },
    ],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "high" as const, reasoning: "x" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.ok(result.results.every((r) => r.result === "Reconnect Required"));
  assert.equal(markPageReconnectRequiredMock.mock.calls.length, 1, "should mark reconnect exactly once per batch, not per task");
});

test("reconcileNextBatch: generic (non-reconnect) Graph error -> Evidence Unavailable, page not marked", async () => {
  const { reconcileNextBatch } = await loadModule();
  fetchShouldThrow = new FakeFacebookGraphError("Some transient Graph error", false);
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "a" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "high" as const, reasoning: "x" }));

  const result = await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(result.results[0].result, "Evidence Unavailable");
  assert.equal(markPageReconnectRequiredMock.mock.calls.length, 0);
});

test("reconcileNextBatch: candidate ranking is capped at 5 sent to AI", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, message: `nội dung biến thể số ${i} không giống hệt` }));
  const client = makeClient({
    seeding_tasks: [{ id: "t1", campaign_target_id: "target-1", comment_text: "một đoạn text hoàn toàn khác" }],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async (input: { candidates: string[] }) => {
    assert.ok(input.candidates.length <= 5, "at most 5 candidates must ever be sent to AI");
    return { bestMatchIndex: null, confidence: "low" as const, reasoning: "x" };
  });

  await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(aiMatchFn.mock.calls.length, 1);
});

test("reconcileNextBatch: hasMoreCandidates reflects candidates beyond this round's batch size", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "sản phẩm đẹp quá" }];
  const client = makeClient({
    seeding_tasks: [
      { id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm đẹp quá" },
      { id: "t2", campaign_target_id: "target-1", comment_text: "sản phẩm đẹp quá" },
      { id: "t3", campaign_target_id: "target-1", comment_text: "sản phẩm đẹp quá" },
    ],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: 0, confidence: "high" as const, reasoning: "x" }));

  const result = await reconcileNextBatch("campaign-1", 2, "staff-1", client, aiMatchFn);
  assert.equal(result.processed, 2);
  assert.equal(result.hasMoreCandidates, true);
});

test("reconcileNextBatch: multiple tasks targeting the same post share one Facebook fetch", async () => {
  const { reconcileNextBatch } = await loadModule();
  commentsToReturn = [{ id: "c1", message: "sản phẩm đẹp quá" }];
  const client = makeClient({
    seeding_tasks: [
      { id: "t1", campaign_target_id: "target-1", comment_text: "sản phẩm đẹp quá" },
      { id: "t2", campaign_target_id: "target-1", comment_text: "text khác" },
    ],
    seeding_campaign_targets: [{ id: "target-1", facebook_post_id: "post-1" }],
    seeding_task_evidence_results: [],
  });
  const aiMatchFn = mock.fn(async () => ({ bestMatchIndex: null, confidence: "low" as const, reasoning: "x" }));

  await reconcileNextBatch("campaign-1", 10, "staff-1", client, aiMatchFn);
  assert.equal(getPostCommentsBoundedSampleMock.mock.calls.length, 1, "one shared target post must be fetched only once per batch round");
});

test("getEvidenceQueueForCampaign: enriches tasks with current evidence, null when never checked", async () => {
  const { getEvidenceQueueForCampaign } = await loadModule();
  const client = makeClient({
    seeding_tasks: [
      { id: "t1", campaign_id: "campaign-1", action_type: "Comment", comment_text: "a", status: "Pending" },
      { id: "t2", campaign_id: "campaign-1", action_type: "Comment", comment_text: "b", status: "Pending" },
    ],
    seeding_task_evidence_results: [
      { task_id: "t1", result: "Exact Match", confidence: null, matched_comment_snippet: "a", checked_at: "2026-08-26T00:00:00Z" },
    ],
  });

  const queue = await getEvidenceQueueForCampaign("campaign-1", client);
  assert.equal(queue.length, 2);
  assert.equal(queue.find((t) => t.id === "t1")?.evidence_result, "Exact Match");
  assert.equal(queue.find((t) => t.id === "t2")?.evidence_result, null);
});
