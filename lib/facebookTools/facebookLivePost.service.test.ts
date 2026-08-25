import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Facebook Live Comment Shield — Phase 2 schema addition (2026-08-24):
 * facebook_live_posts.broadcast_status. Covers the three things the
 * business-requirement review flagged: broadcast_status is actually
 * mapped from Graph API's video.status, a re-sync never touches the
 * unrelated hide-job processing_status column, and both "VOD" and
 * "LIVE_STOPPED" (Meta's two ended-livestream statuses) pass through
 * unmodified — no application-level filtering of the value.
 *
 * `listLiveVideos` is mocked once at module scope (as `mock.fn()`) and
 * reconfigured per test via `.mock.mockImplementationOnce(...)` — same
 * convention as facebookHideJob.service.test.ts's hideCommentsBatchMock —
 * since Node's module cache means facebookLivePost.service.ts is only
 * ever dynamically imported once; re-calling mock.module per test would
 * not rebind an already-imported consumer.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

mock.module("./facebookPage.service", {
  namedExports: {
    getDecryptedPageAccessToken: async () => "fake-token",
    markPageReconnectRequired: async () => {},
    isReconnectRequiredError: () => false,
  },
});

interface FakeLiveVideo {
  id: string;
  title?: string;
  creation_time?: string;
  status?: string;
}

const listLiveVideosMock = mock.fn(async (): Promise<FakeLiveVideo[]> => [
  { id: "video-1", title: "Livestream", creation_time: "2026-08-20T10:00:00Z", status: "LIVE_STOPPED" },
]);
mock.module("./facebookGraphClient", {
  namedExports: {
    listLiveVideos: listLiveVideosMock,
  },
});

interface UpsertCall {
  values: Record<string, unknown>;
  options: Record<string, unknown>;
}

function makeClient(upsertCalls: UpsertCall[]) {
  return {
    from(table: string) {
      if (table !== "facebook_live_posts") throw new Error(`Unexpected table in test fake: ${table}`);
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
              return Promise.resolve({ data: [], error: null });
            },
          };
          return builder;
        },
      };
    },
  } as never;
}

test("syncLivePosts: maps Graph API video.status into broadcast_status", async () => {
  listLiveVideosMock.mock.mockImplementationOnce(async () => [
    { id: "video-1", title: "Livestream 20/08", creation_time: "2026-08-20T10:00:00Z", status: "LIVE_STOPPED" },
  ]);
  const { syncLivePosts } = await import("./facebookLivePost.service");

  const upsertCalls: UpsertCall[] = [];
  const client = makeClient(upsertCalls);

  await syncLivePosts("page-1", "page-row-1", client);

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].values.broadcast_status, "LIVE_STOPPED");
});

test("syncLivePosts: the upsert payload never includes processing_status — a re-sync must never overwrite hide-job progress", async () => {
  listLiveVideosMock.mock.mockImplementationOnce(async () => [
    { id: "video-1", title: "Livestream", creation_time: "2026-08-20T10:00:00Z", status: "LIVE" },
  ]);
  const { syncLivePosts } = await import("./facebookLivePost.service");

  const upsertCalls: UpsertCall[] = [];
  const client = makeClient(upsertCalls);

  await syncLivePosts("page-1", "page-row-1", client);

  assert.equal(upsertCalls.length, 1);
  assert.ok(!("processing_status" in upsertCalls[0].values), "upsert payload must not contain processing_status");
  assert.equal(upsertCalls[0].options.onConflict, "facebook_post_id");
});

test("syncLivePosts: both VOD and LIVE_STOPPED (Meta's two ended-livestream statuses) pass through unmodified", async () => {
  listLiveVideosMock.mock.mockImplementationOnce(async () => [
    { id: "video-vod", title: "Ended, archived", creation_time: "2026-08-19T10:00:00Z", status: "VOD" },
    { id: "video-stopped", title: "Just ended", creation_time: "2026-08-20T10:00:00Z", status: "LIVE_STOPPED" },
  ]);
  const { syncLivePosts } = await import("./facebookLivePost.service");

  const upsertCalls: UpsertCall[] = [];
  const client = makeClient(upsertCalls);

  await syncLivePosts("page-1", "page-row-1", client);

  assert.equal(upsertCalls.length, 2);
  const statuses = upsertCalls.map((c) => c.values.broadcast_status).sort();
  assert.deepEqual(statuses, ["LIVE_STOPPED", "VOD"]);
});

test("syncLivePosts: a live video with no status field maps to null, not a crash or a made-up default", async () => {
  listLiveVideosMock.mock.mockImplementationOnce(async () => [
    { id: "video-no-status", title: "Untitled", creation_time: "2026-08-20T10:00:00Z" },
  ]);
  const { syncLivePosts } = await import("./facebookLivePost.service");

  const upsertCalls: UpsertCall[] = [];
  const client = makeClient(upsertCalls);

  await syncLivePosts("page-1", "page-row-1", client);

  assert.equal(upsertCalls[0].values.broadcast_status, null);
});
