import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Content Discovery Foundation (Phase 2A) — facebook_page_posts caches a
 * connected Page's own regular feed posts. These tests exercise
 * syncPagePosts' own DB reads/writes, its bound-aware metadata
 * (requestCount/fetchedCount/createdCount/updatedCount/hasMore/nextCursor),
 * and its discovery_status classification (Active / Refresh Failed /
 * Unavailable — the last one gated on an exhaustive, non-bounded fetch,
 * PO decision 2026-08-25) against an in-memory fake table, following the
 * same per-table fake-client convention already used in
 * facebookHideJob.service.test.ts / facebookLivePost.service.test.ts.
 * listPagePosts (Graph API) and facebookPage.service are mocked entirely —
 * not this file's concern.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakeListResult {
  posts: unknown[];
  requestCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

const listPagePostsMock = mock.fn(
  async (): Promise<FakeListResult> => ({ posts: [], requestCount: 0, hasMore: false })
);
mock.module("./facebookGraphClient", {
  namedExports: { listPagePosts: listPagePostsMock, DEFAULT_PAGE_POSTS_SYNC_MAX_PAGES: 5 },
});

const getDecryptedPageAccessTokenMock = mock.fn(async () => "fake-token");
const markPageReconnectRequiredMock = mock.fn(async () => {});
const isReconnectRequiredErrorMock = mock.fn(() => false);
mock.module("./facebookPage.service", {
  namedExports: {
    getDecryptedPageAccessToken: getDecryptedPageAccessTokenMock,
    markPageReconnectRequired: markPageReconnectRequiredMock,
    isReconnectRequiredError: isReconnectRequiredErrorMock,
  },
});

interface FakeRow {
  id: string;
  facebook_page_id: string;
  facebook_post_id: string;
  discovery_status: string;
  [key: string]: unknown;
}

function matches(row: FakeRow, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => row[k as keyof FakeRow] === v);
}

function makeClient(store: FakeRow[]) {
  const client = {
    from(table: string) {
      if (table !== "facebook_page_posts") throw new Error(`Unexpected table in test fake: ${table}`);
      return {
        select(_columns: string) {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            order() {
              return Promise.resolve({ data: store.filter((r) => matches(r, filters)), error: null });
            },
            range(from: number, to: number) {
              const matched = store.filter((r) => matches(r, filters));
              return Promise.resolve({ data: matched.slice(from, to + 1), error: null });
            },
            then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
              return Promise.resolve({ data: store.filter((r) => matches(r, filters)), error: null }).then(
                resolve,
                reject
              );
            },
          };
          return builder;
        },
        upsert(values: Record<string, unknown>) {
          const idx = store.findIndex((r) => r.facebook_post_id === values.facebook_post_id);
          if (idx >= 0) store[idx] = { ...store[idx], ...values } as FakeRow;
          else store.push({ id: `row-${store.length + 1}`, ...values } as FakeRow);
          return Promise.resolve({ error: null });
        },
        update(values: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          let idsFilter: { col: string; vals: unknown[] } | null = null;
          const builder = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            in(col: string, vals: unknown[]) {
              idsFilter = { col, vals };
              return builder;
            },
            then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
              store.forEach((r) => {
                if (matches(r, filters) && (!idsFilter || idsFilter.vals.includes(r[idsFilter.col as keyof FakeRow]))) {
                  Object.assign(r, values);
                }
              });
              return Promise.resolve({ error: null }).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
  return client as never;
}

test("syncPagePosts: successful bounded sync upserts posts, reports accurate created/fetched/request counts", async () => {
  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-1", message: "Hello" }, { id: "post-2", message: "World" }],
    requestCount: 1,
    hasMore: false,
  }));
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const store: FakeRow[] = [];
  const client = makeClient(store);

  const result = await syncPagePosts("page-1", "page-row-1", client);

  assert.equal(store.length, 2);
  assert.equal(store[0].discovery_status, "Active");
  assert.equal(result.requestCount, 1);
  assert.equal(result.fetchedCount, 2);
  assert.equal(result.createdCount, 2);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.hasMore, false);
});

test("syncPagePosts: hasMore true — reports the bound was hit and nextCursor, and skips the Unavailable inference entirely", async () => {
  const store: FakeRow[] = [
    { id: "row-old", facebook_page_id: "page-1", facebook_post_id: "post-old", discovery_status: "Active", message: "Old, outside this bounded fetch" },
  ];
  const client = makeClient(store);

  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-new", message: "New" }],
    requestCount: 5,
    hasMore: true,
    nextCursor: "cursor-6",
  }));
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const result = await syncPagePosts("page-1", "page-row-1", client);

  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "cursor-6");
  assert.equal(result.unavailabilityCheckPerformed, false);
  assert.equal(result.unavailableCount, 0);
  const oldRow = store.find((r) => r.facebook_post_id === "post-old")!;
  assert.equal(oldRow.discovery_status, "Active", "a post outside a bounded fetch must never be inferred Unavailable");
});

test("syncPagePosts: hasMore false — a previously cached post missing from the exhaustive fresh result is marked Unavailable, not deleted", async () => {
  const store: FakeRow[] = [
    { id: "row-1", facebook_page_id: "page-1", facebook_post_id: "post-1", discovery_status: "Active", message: "Still here" },
    { id: "row-2", facebook_page_id: "page-1", facebook_post_id: "post-2", discovery_status: "Active", message: "Will disappear" },
  ];
  const client = makeClient(store);

  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-1", message: "Still here" }],
    requestCount: 1,
    hasMore: false,
  }));
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const result = await syncPagePosts("page-1", "page-row-1", client);

  assert.equal(result.unavailabilityCheckPerformed, true);
  assert.equal(result.unavailableCount, 1);
  assert.equal(store.length, 2, "row must not be deleted");
  const post2 = store.find((r) => r.facebook_post_id === "post-2")!;
  assert.equal(post2.discovery_status, "Unavailable");
  assert.equal(post2.message, "Will disappear", "content must be left as last known, not wiped");
});

test("syncPagePosts: idempotent re-sync within the same bound does not create duplicate rows, and correctly reports updatedCount", async () => {
  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-1", message: "v1" }],
    requestCount: 1,
    hasMore: false,
  }));
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const store: FakeRow[] = [];
  const client = makeClient(store);

  const first = await syncPagePosts("page-1", "page-row-1", client);
  assert.equal(first.createdCount, 1);
  assert.equal(first.updatedCount, 0);

  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-1", message: "v2" }],
    requestCount: 1,
    hasMore: false,
  }));
  const second = await syncPagePosts("page-1", "page-row-1", client);

  assert.equal(store.length, 1, "must not duplicate — same facebook_post_id upserts in place");
  assert.equal(store[0].message, "v2");
  assert.equal(second.createdCount, 0);
  assert.equal(second.updatedCount, 1);
});

test("syncPagePosts: createdCount/updatedCount stay accurate when a Page has more cached posts than PostgREST's default row cap (1000)", async () => {
  // Reproduces the exact bug caught on Dev (2026-08-25): a Page with 2082
  // cached posts made an un-paginated existingIds lookup silently return
  // only the first 1000, misclassifying already-cached posts beyond that
  // as "created". This seeds 1200 pre-existing rows (forcing the fake's
  // own range-pagination to run twice, same as production) and asserts a
  // post from row 1199 — outside a naive single-page lookup — is still
  // correctly recognized as already existing.
  const store: FakeRow[] = Array.from({ length: 1200 }, (_, i) => ({
    id: `row-${i}`,
    facebook_page_id: "page-1",
    facebook_post_id: `post-${i}`,
    discovery_status: "Active",
  }));
  const client = makeClient(store);

  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-1199" }, { id: "post-brand-new" }],
    requestCount: 1,
    hasMore: true,
    nextCursor: "cursor-x",
  }));
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const result = await syncPagePosts("page-1", "page-row-1", client);

  assert.equal(result.createdCount, 1, "only the genuinely new post must count as created");
  assert.equal(result.updatedCount, 1, "post-1199 (beyond a naive 1000-row cap) must be recognized as already existing");
});

test("syncPagePosts: a transient/unknown sync failure marks cached rows Refresh Failed and keeps their content, then rethrows", async () => {
  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-1", message: "Original" }],
    requestCount: 1,
    hasMore: false,
  }));
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const store: FakeRow[] = [];
  const client = makeClient(store);
  await syncPagePosts("page-1", "page-row-1", client);

  isReconnectRequiredErrorMock.mock.mockImplementationOnce(() => false);
  listPagePostsMock.mock.mockImplementationOnce(async () => {
    throw new Error("Unknown Graph API error");
  });

  await assert.rejects(() => syncPagePosts("page-1", "page-row-1", client), /Unknown Graph API error/);

  assert.equal(store.length, 1, "row must not be deleted");
  assert.equal(store[0].discovery_status, "Refresh Failed");
  assert.equal(store[0].message, "Original", "content must be left as last known, not wiped");
});

test("syncPagePosts: a reconnect-required error marks the Page for reconnect, not individual post rows, and rethrows", async () => {
  listPagePostsMock.mock.mockImplementationOnce(async () => ({
    posts: [{ id: "post-1", message: "Original" }],
    requestCount: 1,
    hasMore: false,
  }));
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const store: FakeRow[] = [];
  const client = makeClient(store);
  await syncPagePosts("page-1", "page-row-1", client);

  markPageReconnectRequiredMock.mock.resetCalls();
  isReconnectRequiredErrorMock.mock.mockImplementationOnce(() => true);
  listPagePostsMock.mock.mockImplementationOnce(async () => {
    throw new Error("Invalid OAuth access token");
  });

  await assert.rejects(() => syncPagePosts("page-1", "page-row-1", client), /Invalid OAuth access token/);

  assert.equal(markPageReconnectRequiredMock.mock.callCount(), 1);
  assert.equal(store[0].discovery_status, "Active", "per-post status is untouched by a reconnect-required error");
});

test("syncPagePosts: propagates the 'Facebook page not found' guard when the page/token is missing, with no store writes", async () => {
  getDecryptedPageAccessTokenMock.mock.mockImplementationOnce(async () => {
    throw new Error("Facebook page not found");
  });
  const { syncPagePosts } = await import("./facebookPagePost.service");

  const store: FakeRow[] = [];
  const client = makeClient(store);

  await assert.rejects(() => syncPagePosts("page-1", "missing-row", client), /Facebook page not found/);
  assert.equal(store.length, 0);
});

/**
 * Content Repository UI (Phase 2B) — getPagePostsPage's server-side
 * pagination/filters and getDistinctStatusTypes' content-type option list.
 * Separate, fuller fake query-builder from the one above (this one models
 * Supabase's chainable filter methods + count:"exact" semantics), since
 * these functions build a materially different query shape than
 * syncPagePosts' fixed eq/upsert/update calls.
 */

interface FakePostRow {
  id: string;
  facebook_page_id: string;
  facebook_post_id: string;
  message?: string | null;
  status_type?: string | null;
  discovery_status: string;
  published_at?: string | null;
}

function makeQueryClient(rows: FakePostRow[]) {
  const client = {
    from(table: string) {
      if (table !== "facebook_page_posts") throw new Error(`Unexpected table in test fake: ${table}`);
      return {
        select(_columns: string, _opts?: { count?: string }) {
          let filtered = [...rows];
          const builder = {
            eq(col: string, val: unknown) {
              filtered = filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
              return builder;
            },
            ilike(col: string, pattern: string) {
              const needle = pattern.replace(/%/g, "").toLowerCase();
              filtered = filtered.filter((r) =>
                String((r as unknown as Record<string, unknown>)[col] ?? "")
                  .toLowerCase()
                  .includes(needle)
              );
              return builder;
            },
            gte(col: string, val: string) {
              filtered = filtered.filter((r) => {
                const v = (r as unknown as Record<string, unknown>)[col];
                return typeof v === "string" && v >= val;
              });
              return builder;
            },
            lt(col: string, val: string) {
              filtered = filtered.filter((r) => {
                const v = (r as unknown as Record<string, unknown>)[col];
                return typeof v === "string" && v < val;
              });
              return builder;
            },
            order(col: string, opts: { ascending: boolean }) {
              filtered = [...filtered].sort((a, b) => {
                const av = ((a as unknown as Record<string, unknown>)[col] as string) ?? "";
                const bv = ((b as unknown as Record<string, unknown>)[col] as string) ?? "";
                if (av === bv) return 0;
                return opts.ascending ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
              });
              return builder;
            },
            range(from: number, to: number) {
              const count = filtered.length;
              return Promise.resolve({ data: filtered.slice(from, to + 1), error: null, count });
            },
          };
          return builder;
        },
      };
    },
  };
  return client as never;
}

function makeRow(overrides: Partial<FakePostRow> & { id: string; facebook_post_id: string }): FakePostRow {
  return {
    facebook_page_id: "page-1",
    discovery_status: "Active",
    ...overrides,
  };
}

test("getPagePostsPage: server-side pagination — page 1 returns exactly PAGE_SIZE (24) rows, never the full set", async () => {
  const rows = Array.from({ length: 30 }, (_, i) =>
    makeRow({ id: `row-${i}`, facebook_post_id: `post-${i}`, published_at: `2026-08-${String(30 - i).padStart(2, "0")}T00:00:00.000Z` })
  );
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage({ pageId: "page-1", page: 1 }, makeQueryClient(rows));

  assert.equal(result.rows.length, 24);
  assert.equal(result.totalCount, 30);
});

test("getPagePostsPage: page 2 returns the remainder, totalCount stays accurate regardless of slice", async () => {
  const rows = Array.from({ length: 30 }, (_, i) =>
    makeRow({ id: `row-${i}`, facebook_post_id: `post-${i}`, published_at: `2026-08-${String(30 - i).padStart(2, "0")}T00:00:00.000Z` })
  );
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage({ pageId: "page-1", page: 2 }, makeQueryClient(rows));

  assert.equal(result.rows.length, 6);
  assert.equal(result.totalCount, 30);
});

test("getPagePostsPage: a page beyond available data returns empty rows with the correct (non-zero) totalCount", async () => {
  const rows = [makeRow({ id: "row-1", facebook_post_id: "post-1" })];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage({ pageId: "page-1", page: 99 }, makeQueryClient(rows));

  assert.deepEqual(result.rows, []);
  assert.equal(result.totalCount, 1, "totalCount must never be silently reported as 0 just because this page is empty");
});

test("getPagePostsPage: search filters by message content, case-insensitively", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", message: "Vòng ngọc bích đẹp" }),
    makeRow({ id: "row-2", facebook_post_id: "post-2", message: "Nhẫn kim cương" }),
  ];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage({ pageId: "page-1", page: 1, search: "NGỌC" }, makeQueryClient(rows));

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].facebook_post_id, "post-1");
});

test("getPagePostsPage: statusType filter", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", status_type: "added_photos" }),
    makeRow({ id: "row-2", facebook_post_id: "post-2", status_type: "added_video" }),
  ];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage({ pageId: "page-1", page: 1, statusType: "added_video" }, makeQueryClient(rows));

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].facebook_post_id, "post-2");
});

test("getPagePostsPage: discoveryStatus filter", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", discovery_status: "Active" }),
    makeRow({ id: "row-2", facebook_post_id: "post-2", discovery_status: "Unavailable" }),
  ];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage(
    { pageId: "page-1", page: 1, discoveryStatus: "Unavailable" },
    makeQueryClient(rows)
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].facebook_post_id, "post-2");
});

test("getPagePostsPage: combined filters (search + statusType + discoveryStatus) narrow correctly together", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", message: "Vòng ngọc", status_type: "added_photos", discovery_status: "Active" }),
    makeRow({ id: "row-2", facebook_post_id: "post-2", message: "Vòng ngọc", status_type: "added_video", discovery_status: "Active" }),
    makeRow({ id: "row-3", facebook_post_id: "post-3", message: "Vòng ngọc", status_type: "added_photos", discovery_status: "Unavailable" }),
  ];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage(
    { pageId: "page-1", page: 1, search: "ngọc", statusType: "added_photos", discoveryStatus: "Active" },
    makeQueryClient(rows)
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].facebook_post_id, "post-1");
});

test("getPagePostsPage: no matches returns an empty result, never throws", async () => {
  const rows = [makeRow({ id: "row-1", facebook_post_id: "post-1", message: "Vòng ngọc" })];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage({ pageId: "page-1", page: 1, search: "không tồn tại" }, makeQueryClient(rows));

  assert.deepEqual(result.rows, []);
  assert.equal(result.totalCount, 0);
});

test("vietnamDayStartUtc/vietnamDayEndExclusiveUtc: exact millisecond boundaries for a Vietnam-local calendar day", async () => {
  const { vietnamDayStartUtc, vietnamDayEndExclusiveUtc } = await import("./facebookPagePost.service");

  // Vietnam midnight (UTC+7) on 2026-08-25 = 2026-08-24T17:00:00.000Z.
  assert.equal(vietnamDayStartUtc("2026-08-25").toISOString(), "2026-08-24T17:00:00.000Z");
  // Exclusive end = start of the next Vietnam day = 2026-08-25T17:00:00.000Z.
  assert.equal(vietnamDayEndExclusiveUtc("2026-08-25").toISOString(), "2026-08-25T17:00:00.000Z");
});

test("getPagePostsPage: dateFrom/dateTo cover the FULL Vietnam-local day — a post published at 23:59 local time is not dropped", async () => {
  const rows = [
    // 2026-08-25T16:59:00Z = 2026-08-25 23:59 Vietnam time — the very last minute of Aug 25 locally.
    makeRow({ id: "row-late", facebook_post_id: "post-late", published_at: "2026-08-25T16:59:00.000Z" }),
    // 2026-08-25T17:00:00Z = 2026-08-26 00:00 Vietnam time — the first minute of Aug 26 locally.
    makeRow({ id: "row-next-day", facebook_post_id: "post-next-day", published_at: "2026-08-25T17:00:00.000Z" }),
    // 2026-08-24T16:59:59Z = 2026-08-24 23:59:59 Vietnam time — the last second of Aug 24 locally.
    makeRow({ id: "row-prev-day", facebook_post_id: "post-prev-day", published_at: "2026-08-24T16:59:59.000Z" }),
  ];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage(
    { pageId: "page-1", page: 1, dateFrom: "2026-08-25", dateTo: "2026-08-25" },
    makeQueryClient(rows)
  );

  const ids = result.rows.map((r) => r.facebook_post_id).sort();
  assert.deepEqual(ids, ["post-late"], "only the post genuinely published on 2026-08-25 Vietnam time must match");
});

test("getPagePostsPage: dateFrom alone includes everything from that Vietnam day onward (no artificial upper bound)", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", published_at: "2026-08-24T16:59:59.000Z" }), // Aug 24 VN
    makeRow({ id: "row-2", facebook_post_id: "post-2", published_at: "2026-08-25T17:00:00.000Z" }), // Aug 26 VN
  ];
  const { getPagePostsPage } = await import("./facebookPagePost.service");

  const result = await getPagePostsPage({ pageId: "page-1", page: 1, dateFrom: "2026-08-25" }, makeQueryClient(rows));

  assert.deepEqual(result.rows.map((r) => r.facebook_post_id).sort(), ["post-2"]);
});

test("getDistinctStatusTypes: returns the distinct, sorted, non-null values actually present — never a hardcoded list", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", status_type: "mobile_status_update" }),
    makeRow({ id: "row-2", facebook_post_id: "post-2", status_type: "added_photos" }),
    makeRow({ id: "row-3", facebook_post_id: "post-3", status_type: "added_photos" }),
    makeRow({ id: "row-4", facebook_post_id: "post-4", status_type: null }),
  ];
  const { getDistinctStatusTypes } = await import("./facebookPagePost.service");

  const result = await getDistinctStatusTypes("page-1", makeQueryClient(rows));

  assert.deepEqual(result, ["added_photos", "mobile_status_update"]);
});

test("getDistinctStatusTypes: a status_type never seen before passes through gracefully, no crash, no filtering against a fixed set", async () => {
  const rows = [makeRow({ id: "row-1", facebook_post_id: "post-1", status_type: "shared_story" })];
  const { getDistinctStatusTypes } = await import("./facebookPagePost.service");

  const result = await getDistinctStatusTypes("page-1", makeQueryClient(rows));

  assert.deepEqual(result, ["shared_story"]);
});

test("getDistinctStatusTypes: correctly covers a Page with more cached posts than PostgREST's default row cap (1000)", async () => {
  const rows = Array.from({ length: 1200 }, (_, i) =>
    makeRow({ id: `row-${i}`, facebook_post_id: `post-${i}`, status_type: i === 1199 ? "added_video" : "added_photos" })
  );
  const { getDistinctStatusTypes } = await import("./facebookPagePost.service");

  const result = await getDistinctStatusTypes("page-1", makeQueryClient(rows));

  assert.deepEqual(result, ["added_photos", "added_video"], "a distinct value only present beyond row 1000 must not be missed");
});

/** Phase 2K-CF (Issue 5, Decision B — LOCKED) — getPagePostIds: ids only,
 * matching the exact same filter set getPagePostsPage applies, for
 * "Chọn tất cả" (select every post matching the current search/filter,
 * not just the currently-loaded page). */

test("getPagePostIds: returns every id matching the current page, not just one page's worth", async () => {
  const rows = Array.from({ length: 48 }, (_, i) => makeRow({ id: `row-${i}`, facebook_post_id: `post-${i}` }));
  const { getPagePostIds } = await import("./facebookPagePost.service");

  const result = await getPagePostIds({ pageId: "page-1" }, makeQueryClient(rows));

  assert.equal(result.length, 48, "must return every matching id, well beyond one FACEBOOK_PAGE_POSTS_PAGE_SIZE page");
});

test("getPagePostIds: correctly loops past PostgREST's default 1000-row cap (real Dev bug found during UAT — a single range() request silently truncated at 1000 of 2120 real posts)", async () => {
  const rows = Array.from({ length: 1500 }, (_, i) => makeRow({ id: `row-${i}`, facebook_post_id: `post-${i}` }));
  const { getPagePostIds } = await import("./facebookPagePost.service");

  const result = await getPagePostIds({ pageId: "page-1" }, makeQueryClient(rows));

  assert.equal(result.length, 1500, "must not silently truncate at 1000");
});

test("getPagePostIds: applies the exact same search filter as getPagePostsPage", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", message: "Vòng ngọc bích đẹp" }),
    makeRow({ id: "row-2", facebook_post_id: "post-2", message: "Sản phẩm khác" }),
  ];
  const { getPagePostIds } = await import("./facebookPagePost.service");

  const result = await getPagePostIds({ pageId: "page-1", search: "ngọc" }, makeQueryClient(rows));

  assert.deepEqual(result, ["row-1"]);
});

test("getPagePostIds: an empty result set (no posts match) returns an empty array, never an error", async () => {
  const rows = [makeRow({ id: "row-1", facebook_post_id: "post-1", message: "Không khớp" })];
  const { getPagePostIds } = await import("./facebookPagePost.service");

  const result = await getPagePostIds({ pageId: "page-1", search: "không tồn tại" }, makeQueryClient(rows));

  assert.deepEqual(result, []);
});

test("getPagePostIds: scoped to the given pageId only, never returns another Page's posts", async () => {
  const rows = [
    makeRow({ id: "row-1", facebook_post_id: "post-1", facebook_page_id: "page-1" }),
    makeRow({ id: "row-2", facebook_post_id: "post-2", facebook_page_id: "page-2" }),
  ];
  const { getPagePostIds } = await import("./facebookPagePost.service");

  const result = await getPagePostIds({ pageId: "page-1" }, makeQueryClient(rows));

  assert.deepEqual(result, ["row-1"]);
});
