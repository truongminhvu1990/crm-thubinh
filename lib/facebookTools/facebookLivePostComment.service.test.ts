import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Facebook Live Comment Shield — Phase 3 foundation (2026-08-24):
 * facebook_live_post_comments comment cache. Covers mapping Graph API
 * comment data into the cache row, the reconnect-required error path, and
 * that this file never touches hide-job logic — no hide action is called
 * or even importable from here.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakeCommentData {
  id: string;
  from?: { id: string; name: string };
  message?: string;
  created_time?: string;
}

const listLivePostCommentsMock = mock.fn(async (): Promise<FakeCommentData[]> => [
  { id: "comment-1", from: { id: "fb-user-1", name: "Nguyễn Văn A" }, message: "Còn hàng không shop?", created_time: "2026-08-24T10:00:00Z" },
]);
mock.module("./facebookGraphClient", {
  namedExports: {
    listLivePostComments: listLivePostCommentsMock,
  },
});

let markPageReconnectRequiredCalled = false;
let reconnectRequired = false;
mock.module("./facebookPage.service", {
  namedExports: {
    getPageByFacebookPageId: async () => ({ id: "page-row-1", facebook_page_id: "fb-page-1" }),
    getDecryptedPageAccessToken: async () => "fake-token",
    markPageReconnectRequired: async () => {
      markPageReconnectRequiredCalled = true;
    },
    isReconnectRequiredError: () => reconnectRequired,
  },
});

mock.module("./facebookLivePost.service", {
  namedExports: {
    getLivePostById: async () => ({
      id: "live-post-1",
      facebook_page_id: "fb-page-1",
      facebook_post_id: "fb-post-1",
    }),
  },
});

interface UpsertCall {
  values: Record<string, unknown>;
  options: Record<string, unknown>;
}

function makeClient(upsertCalls: UpsertCall[], selectResult: { data: unknown[]; error: unknown } = { data: [], error: null }) {
  return {
    from(table: string) {
      if (table !== "facebook_live_post_comments") throw new Error(`Unexpected table in test fake: ${table}`);
      return {
        upsert(values: Record<string, unknown>, options: Record<string, unknown>) {
          upsertCalls.push({ values, options });
          return Promise.resolve({ error: null });
        },
        select(_columns: string) {
          const builder = {
            eq(_column: string, _value: string) {
              return builder;
            },
            order(_column: string, _opts: unknown) {
              return Promise.resolve(selectResult);
            },
          };
          return builder;
        },
      };
    },
  } as never;
}

test("syncLivePostComments: maps Graph API comment fields (from/message/created_time) into the cache row", async () => {
  listLivePostCommentsMock.mock.mockImplementationOnce(async () => [
    { id: "comment-1", from: { id: "fb-user-1", name: "Nguyễn Văn A" }, message: "Còn hàng không shop?", created_time: "2026-08-24T10:00:00Z" },
  ]);
  const { syncLivePostComments } = await import("./facebookLivePostComment.service");

  const upsertCalls: UpsertCall[] = [];
  const client = makeClient(upsertCalls);

  await syncLivePostComments("live-post-1", client);

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].values.facebook_comment_id, "comment-1");
  assert.equal(upsertCalls[0].values.author_id, "fb-user-1");
  assert.equal(upsertCalls[0].values.author_name, "Nguyễn Văn A");
  assert.equal(upsertCalls[0].values.message, "Còn hàng không shop?");
  assert.equal(upsertCalls[0].values.comment_created_at, "2026-08-24T10:00:00Z");
  assert.equal(upsertCalls[0].options.onConflict, "facebook_comment_id");
});

test("syncLivePostComments: a comment with no author (deleted/anonymized) maps to null fields, not a crash", async () => {
  listLivePostCommentsMock.mock.mockImplementationOnce(async () => [
    { id: "comment-2", message: "Giá bao nhiêu?" },
  ]);
  const { syncLivePostComments } = await import("./facebookLivePostComment.service");

  const upsertCalls: UpsertCall[] = [];
  const client = makeClient(upsertCalls);

  await syncLivePostComments("live-post-1", client);

  assert.equal(upsertCalls[0].values.author_id, null);
  assert.equal(upsertCalls[0].values.author_name, null);
  assert.equal(upsertCalls[0].values.message, "Giá bao nhiêu?");
});

test("syncLivePostComments: a reconnect-required Graph error marks the Page and rethrows, without writing any row", async () => {
  reconnectRequired = true;
  listLivePostCommentsMock.mock.mockImplementationOnce(async () => {
    throw new Error("simulated token error");
  });
  const { syncLivePostComments } = await import("./facebookLivePostComment.service");

  const upsertCalls: UpsertCall[] = [];
  const client = makeClient(upsertCalls);

  await assert.rejects(() => syncLivePostComments("live-post-1", client));
  assert.equal(markPageReconnectRequiredCalled, true);
  assert.equal(upsertCalls.length, 0);
  reconnectRequired = false;
  markPageReconnectRequiredCalled = false;
});

test("getLivePostComments: returns cached rows, empty array (not a throw) on a query error", async () => {
  const { getLivePostComments } = await import("./facebookLivePostComment.service");

  const client = makeClient([], { data: null as unknown as unknown[], error: { message: "simulated failure" } });
  const result = await getLivePostComments("live-post-1", client);
  assert.deepEqual(result, []);
});
