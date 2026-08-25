import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { listPagePosts } from "./facebookGraphClient";

/** Content Discovery Foundation (Phase 2A) — listPagePosts' own cursor loop
 * and its bound (PO decision, 2026-08-25: no default full-history walk),
 * exercised directly against a mocked global fetch (no facebookGraphClient
 * module mocking, unlike the service-layer tests). */

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function withMockedFetch(fetchMock: (url: string | URL) => Promise<Response>, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test("listPagePosts: walks every page via the after-cursor until paging.next is absent (hasMore: false)", async () => {
  const calls: string[] = [];
  await withMockedFetch(
    async (url) => {
      const urlStr = url.toString();
      calls.push(urlStr);
      if (!urlStr.includes("after=")) {
        return jsonResponse({
          data: [{ id: "post-1" }],
          paging: { cursors: { after: "cursor-2" }, next: "https://graph.facebook.com/v21.0/page-1/posts?after=cursor-2" },
        });
      }
      return jsonResponse({ data: [{ id: "post-2" }], paging: {} });
    },
    async () => {
      const result = await listPagePosts("page-1", "token-1", 5);
      assert.deepEqual(
        result.posts.map((p) => p.id),
        ["post-1", "post-2"]
      );
      assert.equal(result.requestCount, 2);
      assert.equal(result.hasMore, false);
      assert.equal(result.nextCursor, undefined);
      assert.equal(calls.length, 2, "must issue one fetch per page");
      assert.ok(calls[1].includes("after=cursor-2"));
    }
  );
});

test("listPagePosts: a single page with no paging.next stops after one call", async () => {
  const fetchMock = mock.fn(async () => jsonResponse({ data: [{ id: "post-1" }], paging: {} }));
  await withMockedFetch(fetchMock, async () => {
    const result = await listPagePosts("page-1", "token-1", 5);
    assert.equal(result.posts.length, 1);
    assert.equal(result.requestCount, 1);
    assert.equal(result.hasMore, false);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});

test("listPagePosts: stops at maxPages when more data remains — reports hasMore: true and the cursor to continue from", async () => {
  let page = 0;
  const fetchMock = mock.fn(async () => {
    page++;
    return jsonResponse({
      data: [{ id: `post-${page}` }],
      paging: { cursors: { after: `cursor-${page + 1}` }, next: `https://graph.facebook.com/v21.0/page-1/posts?after=cursor-${page + 1}` },
    });
  });
  await withMockedFetch(fetchMock, async () => {
    const result = await listPagePosts("page-1", "token-1", 3);
    assert.equal(result.requestCount, 3, "must stop exactly at maxPages, never exceed it");
    assert.equal(result.posts.length, 3);
    assert.equal(result.hasMore, true);
    assert.equal(result.nextCursor, "cursor-4", "must surface the cursor to resume from, even though it never fetches it itself");
    assert.equal(fetchMock.mock.callCount(), 3, "must never issue a 4th request once the bound is hit");
  });
});

test("listPagePosts: exhausting all pages exactly at maxPages reports hasMore: false, not true", async () => {
  let page = 0;
  const fetchMock = mock.fn(async () => {
    page++;
    if (page < 3) {
      return jsonResponse({
        data: [{ id: `post-${page}` }],
        paging: { cursors: { after: `cursor-${page + 1}` }, next: `...after=cursor-${page + 1}` },
      });
    }
    return jsonResponse({ data: [{ id: `post-${page}` }], paging: {} });
  });
  await withMockedFetch(fetchMock, async () => {
    const result = await listPagePosts("page-1", "token-1", 3);
    assert.equal(result.requestCount, 3);
    assert.equal(result.hasMore, false, "Graph itself ran out of pages exactly at the bound — this is completion, not truncation");
    assert.equal(result.nextCursor, undefined);
  });
});
