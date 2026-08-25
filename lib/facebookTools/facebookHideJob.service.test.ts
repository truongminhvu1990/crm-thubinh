import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Facebook Live Comment Shield — processNextBatch is the core queue-drain
 * loop (module has no cron/worker; the browser polls this repeatedly).
 * These tests mock the Graph API + Page/Live Post lookups entirely (not
 * this module's concern) and exercise only facebookHideJob.service's own
 * DB reads/writes and its retry/completion classification, via the same
 * per-table sequenced-fake-client pattern already used in
 * lib/partner/partner.service.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

const listAllCommentsMock = mock.fn(async () => ["c1", "c2"]);
const hideCommentsBatchMock = mock.fn(async (ids: string[]) =>
  ids.map((commentId) => ({ commentId, success: true }))
);
// Defaults to null (ambiguous/not confirmed) — matches getCommentHiddenStatus's
// own real contract of never throwing and returning null on any Graph
// error, so tests that don't care about verification (e.g. the two
// pre-existing tests below) keep their original "unverified failure stays
// error" behavior without needing to mock this per test.
const getCommentHiddenStatusMock = mock.fn(async (): Promise<boolean | null> => null);
mock.module("./facebookGraphClient", {
  namedExports: {
    listAllComments: listAllCommentsMock,
    hideCommentsBatch: hideCommentsBatchMock,
    getCommentHiddenStatus: getCommentHiddenStatusMock,
    FacebookGraphError: class FacebookGraphError extends Error {},
  },
});

mock.module("./facebookPage.service", {
  namedExports: {
    getPageByFacebookPageId: async () => ({ id: "page-row-1", facebook_page_id: "fb-page-1" }),
    getDecryptedPageAccessToken: async () => "fake-token",
    markPageReconnectRequired: async () => {},
    isReconnectRequiredError: () => false,
  },
});

mock.module("./facebookLivePost.service", {
  namedExports: {
    getLivePostById: async () => ({
      id: "live-post-1",
      facebook_page_id: "fb-page-1",
      facebook_post_id: "fb-post-1",
    }),
    updateLivePostProcessingStatus: async () => {},
  },
});

interface FakeResult {
  data: unknown;
  error?: unknown;
}

function makeClient(perTableSequence: Record<string, FakeResult[]>) {
  const counters: Record<string, number> = {};
  const client = {
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
    // Exposed for tests that need to prove a table was (or wasn't) hit a
    // specific number of times — e.g. that the idempotency guard actually
    // skipped the update+select call rather than just returning matching data.
    __callCounts: counters,
  };
  return client as never;
}

test("processNextBatch: all comments hidden successfully -> job completes with success_count == total", async () => {
  hideCommentsBatchMock.mock.mockImplementationOnce(async (ids: string[]) =>
    ids.map((commentId) => ({ commentId, success: true }))
  );

  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-1", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 2 } },
      // recomputeAndPersistCounts' own current-state fetch — still "pending", so the
      // idempotency guard does not apply and the update below proceeds normally.
      { data: { id: "job-1", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 2 } },
      { data: { id: "job-1", facebook_live_post_id: "live-post-1", status: "completed", processed_count: 2, success_count: 2, error_count: 0, total_comments: 2 } },
    ],
    facebook_hide_comment_logs: [
      { data: [
        { id: "log-1", facebook_comment_id: "c1", attempt_count: 0 },
        { id: "log-2", facebook_comment_id: "c2", attempt_count: 0 },
      ] },
      { data: null }, // update log-1
      { data: null }, // update log-2
      { data: [
        { status: "success", attempt_count: 1 },
        { status: "success", attempt_count: 1 },
      ] },
    ],
  });

  const { job, batchProcessed } = await processNextBatch("job-1", client);

  assert.equal(batchProcessed, 2);
  assert.equal(job.status, "completed");
  assert.equal(job.success_count, 2);
  assert.equal(job.error_count, 0);
});

test("processNextBatch: a comment that reaches 3 attempts is a permanent error -> completed_with_errors", async () => {
  hideCommentsBatchMock.mock.mockImplementationOnce(async () => [
    { commentId: "c1", success: true },
    { commentId: "c2", success: false, errorMessage: "Graph API error" },
  ]);

  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-2", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 2 } },
      // recomputeAndPersistCounts' own current-state fetch — still "pending".
      { data: { id: "job-2", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 2 } },
      { data: { id: "job-2", facebook_live_post_id: "live-post-1", status: "completed_with_errors", processed_count: 2, success_count: 1, error_count: 1, total_comments: 2 } },
    ],
    facebook_hide_comment_logs: [
      { data: [
        { id: "log-1", facebook_comment_id: "c1", attempt_count: 0 },
        // Third attempt (attempt_count already 2) — a failure here must be
        // classified as permanent, not left eligible for another retry.
        { id: "log-2", facebook_comment_id: "c2", attempt_count: 2 },
      ] },
      { data: null }, // update log-1 (success)
      { data: null }, // update log-2 (error, attempt_count -> 3)
      { data: [
        { status: "success", attempt_count: 1 },
        { status: "error", attempt_count: 3 },
      ] },
    ],
  });

  const { job } = await processNextBatch("job-2", client);

  assert.equal(job.status, "completed_with_errors");
  assert.equal(job.success_count, 1);
  assert.equal(job.error_count, 1);
});

/**
 * Case B (2026-08-25): hideCommentsBatch's subresponse for a comment can
 * report failure even though Facebook actually applied is_hidden=true — a
 * real Graph Batch-endpoint quirk, proven on Dev by checking is_hidden
 * directly for comments the DB had recorded as permanently failed. These
 * five tests cover processNextBatch's new verify-before-permanent-error
 * step for non-reconnect failures.
 */

test("processNextBatch: failed batch result + getCommentHiddenStatus confirms is_hidden:true -> reclassified as success", async () => {
  hideCommentsBatchMock.mock.mockImplementationOnce(async () => [
    { commentId: "c1", success: false, errorMessage: "An unknown error occurred" },
  ]);
  getCommentHiddenStatusMock.mock.mockImplementationOnce(async () => true);

  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-7", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-7", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-7", facebook_live_post_id: "live-post-1", status: "completed", processed_count: 1, success_count: 1, error_count: 0, total_comments: 1 } },
    ],
    facebook_hide_comment_logs: [
      { data: [{ id: "log-1", facebook_comment_id: "c1", attempt_count: 0 }] },
      { data: null }, // update log-1 — reclassified to success
      { data: [{ status: "success", attempt_count: 1 }] },
    ],
  });

  const callsBefore = getCommentHiddenStatusMock.mock.callCount();
  const { job } = await processNextBatch("job-7", client);

  assert.equal(getCommentHiddenStatusMock.mock.callCount(), callsBefore + 1);
  assert.equal(job.status, "completed");
  assert.equal(job.success_count, 1);
  assert.equal(job.error_count, 0);
});

test("processNextBatch: failed batch result + getCommentHiddenStatus confirms is_hidden:false -> stays error", async () => {
  hideCommentsBatchMock.mock.mockImplementationOnce(async () => [
    { commentId: "c1", success: false, errorMessage: "(#200) Can not hide or unhide this comment" },
  ]);
  getCommentHiddenStatusMock.mock.mockImplementationOnce(async () => false);

  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-8", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-8", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-8", facebook_live_post_id: "live-post-1", status: "failed", processed_count: 1, success_count: 0, error_count: 1, total_comments: 1 } },
    ],
    facebook_hide_comment_logs: [
      { data: [{ id: "log-1", facebook_comment_id: "c1", attempt_count: 2 }] },
      { data: null }, // update log-1 — stays error, permanent (attempt_count -> 3)
      { data: [{ status: "error", attempt_count: 3 }] },
    ],
  });

  const callsBefore = getCommentHiddenStatusMock.mock.callCount();
  const { job } = await processNextBatch("job-8", client);

  assert.equal(getCommentHiddenStatusMock.mock.callCount(), callsBefore + 1);
  assert.equal(job.status, "failed");
  assert.equal(job.error_count, 1);
});

test("processNextBatch: verification returns null (ambiguous/failed) -> original error remains error, never claims success", async () => {
  hideCommentsBatchMock.mock.mockImplementationOnce(async () => [
    { commentId: "c1", success: false, errorMessage: "An unknown error occurred" },
  ]);
  getCommentHiddenStatusMock.mock.mockImplementationOnce(async () => null);

  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-9", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-9", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-9", facebook_live_post_id: "live-post-1", status: "failed", processed_count: 1, success_count: 0, error_count: 1, total_comments: 1 } },
    ],
    facebook_hide_comment_logs: [
      { data: [{ id: "log-1", facebook_comment_id: "c1", attempt_count: 2 }] },
      { data: null }, // update log-1 — stays error, verification was inconclusive
      { data: [{ status: "error", attempt_count: 3 }] },
    ],
  });

  const callsBefore = getCommentHiddenStatusMock.mock.callCount();
  const { job } = await processNextBatch("job-9", client);

  assert.equal(getCommentHiddenStatusMock.mock.callCount(), callsBefore + 1);
  assert.equal(job.error_count, 1);
  assert.equal(job.success_count, 0);
});

test("processNextBatch: a success:true batch result never calls getCommentHiddenStatus", async () => {
  hideCommentsBatchMock.mock.mockImplementationOnce(async () => [{ commentId: "c1", success: true }]);

  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-10", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-10", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-10", facebook_live_post_id: "live-post-1", status: "completed", processed_count: 1, success_count: 1, error_count: 0, total_comments: 1 } },
    ],
    facebook_hide_comment_logs: [
      { data: [{ id: "log-1", facebook_comment_id: "c1", attempt_count: 0 }] },
      { data: null },
      { data: [{ status: "success", attempt_count: 1 }] },
    ],
  });

  const callsBefore = getCommentHiddenStatusMock.mock.callCount();
  await processNextBatch("job-10", client);
  assert.equal(getCommentHiddenStatusMock.mock.callCount(), callsBefore);
});

test("processNextBatch: reconnect-required failure is unaffected by verification (unchanged behavior)", async () => {
  hideCommentsBatchMock.mock.mockImplementationOnce(async () => [
    { commentId: "c1", success: false, errorMessage: "Invalid OAuth access token", requiresReconnect: true },
  ]);

  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-11", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-11", facebook_live_post_id: "live-post-1", status: "pending", total_comments: 1 } },
      { data: { id: "job-11", facebook_live_post_id: "live-post-1", status: "failed", processed_count: 1, success_count: 0, error_count: 1, total_comments: 1 } },
    ],
    facebook_hide_comment_logs: [
      { data: [{ id: "log-1", facebook_comment_id: "c1", attempt_count: 0 }] },
      { data: null }, // update log-1 — reconnect path sets attempt_count straight to MAX_ATTEMPTS
      { data: [{ status: "error", attempt_count: 3 }] },
    ],
  });

  const callsBefore = getCommentHiddenStatusMock.mock.callCount();
  const { job } = await processNextBatch("job-11", client);

  // Reconnect-required failures skip verification entirely — same as before this change.
  assert.equal(getCommentHiddenStatusMock.mock.callCount(), callsBefore);
  assert.equal(job.status, "failed");
  assert.equal(job.error_count, 1);
});

test("processNextBatch: already-terminal job is a no-op (safe for the UI to keep polling)", async () => {
  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      { data: { id: "job-3", facebook_live_post_id: "live-post-1", status: "completed", total_comments: 2, success_count: 2, error_count: 0, processed_count: 2 } },
    ],
    facebook_hide_comment_logs: [],
  });

  const { job, batchProcessed } = await processNextBatch("job-3", client);
  assert.equal(batchProcessed, 0);
  assert.equal(job.status, "completed");
});

/**
 * Case C (2026-08-24): recomputeAndPersistCounts' idempotency guard.
 * Proven on Dev — a terminal job's completed_at silently moved hours
 * forward with every facebook_hide_comment_logs row for it provably
 * untouched, because recomputeAndPersistCounts unconditionally re-stamped
 * completed_at on every call, even a repeated/overlapping one with no new
 * work. These three tests cover the required contract: a genuine first
 * transition still sets completed_at, a repeated no-op recompute on an
 * already-terminal job changes nothing (proven via __callCounts, not just
 * matching return data), and a genuine state change (retry reopening a
 * terminal job) still updates normally.
 */

test("recomputeAndPersistCounts: first transition to terminal sets completed_at", async () => {
  const { processNextBatch } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      // processNextBatch's initial fetch — not yet terminal.
      { data: { id: "job-4", facebook_live_post_id: "live-post-1", status: "in_progress", total_comments: 2, processed_count: 0, success_count: 0, error_count: 0, completed_at: null } },
      // recomputeAndPersistCounts' own current-state fetch — still not terminal, so this is a genuine first transition.
      { data: { id: "job-4", facebook_live_post_id: "live-post-1", status: "in_progress", total_comments: 2, processed_count: 0, success_count: 0, error_count: 0, completed_at: null } },
      // the update+select — completed_at is freshly set.
      { data: { id: "job-4", facebook_live_post_id: "live-post-1", status: "completed", total_comments: 2, processed_count: 2, success_count: 2, error_count: 0, completed_at: "2026-08-24T12:00:00.000Z" } },
    ],
    facebook_hide_comment_logs: [
      { data: [] }, // candidates query: nothing pending/retryable left
      { data: [
        { status: "success", attempt_count: 1 },
        { status: "success", attempt_count: 1 },
      ] }, // recompute's full logs select — everything already resolved
    ],
  });

  const { job, batchProcessed } = await processNextBatch("job-4", client);

  assert.equal(batchProcessed, 0);
  assert.equal(job.status, "completed");
  assert.equal(job.completed_at, "2026-08-24T12:00:00.000Z");
  assert.equal((client as unknown as { __callCounts: Record<string, number> }).__callCounts.facebook_hide_jobs, 3);
});

test("recomputeAndPersistCounts: repeated recompute on an unchanged terminal job does not change completed_at", async () => {
  const { retryFailedComments } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      // recomputeAndPersistCounts' current-state fetch — already terminal, with counts that
      // exactly match what the (unchanged) logs below will recompute to.
      { data: { id: "job-5", facebook_live_post_id: "live-post-1", status: "completed", total_comments: 2, processed_count: 2, success_count: 2, error_count: 0, completed_at: "2026-08-24T12:00:00.000Z" } },
    ],
    facebook_hide_comment_logs: [
      { data: null }, // reset-error-rows-to-pending update — matches zero rows (nothing errored)
      { data: [
        { status: "success", attempt_count: 1 },
        { status: "success", attempt_count: 1 },
      ] }, // recompute's full logs select — identical to what's already stored
    ],
  });

  const job = await retryFailedComments("job-5", client);

  assert.equal(job.status, "completed");
  assert.equal(job.completed_at, "2026-08-24T12:00:00.000Z");
  // Only the one current-state fetch happened — no update+select was issued.
  assert.equal((client as unknown as { __callCounts: Record<string, number> }).__callCounts.facebook_hide_jobs, 1);
});

test("recomputeAndPersistCounts: a genuine state change (retry reopening a terminal job) still updates normally", async () => {
  const { retryFailedComments } = await import("./facebookHideJob.service");

  const client = makeClient({
    facebook_hide_jobs: [
      // recomputeAndPersistCounts' current-state fetch — terminal, with one permanent error.
      { data: { id: "job-6", facebook_live_post_id: "live-post-1", status: "completed_with_errors", total_comments: 2, processed_count: 2, success_count: 1, error_count: 1, completed_at: "2026-08-24T12:00:00.000Z" } },
      // the update+select — reopened, no longer done, completed_at cleared.
      { data: { id: "job-6", facebook_live_post_id: "live-post-1", status: "in_progress", total_comments: 2, processed_count: 1, success_count: 1, error_count: 0, completed_at: null } },
    ],
    facebook_hide_comment_logs: [
      { data: null }, // reset-error-rows-to-pending update — the one error row is reset
      { data: [
        { status: "success", attempt_count: 1 },
        { status: "pending", attempt_count: 0 },
      ] }, // recompute's full logs select — one comment is back in play
    ],
  });

  const job = await retryFailedComments("job-6", client);

  assert.equal(job.status, "in_progress");
  assert.equal(job.completed_at, null);
  assert.equal((client as unknown as { __callCounts: Record<string, number> }).__callCounts.facebook_hide_jobs, 2);
});
