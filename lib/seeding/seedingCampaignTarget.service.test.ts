import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Seeding Campaign Management (Phase 2C) — the Campaign <-> Target Post
 * junction: multi-target add (bulk + single), idempotent duplicate-skip,
 * cross-Facebook-Page rejection (app-layer pre-check; the DB trigger
 * itself is Dev-UAT-verified, not unit-tested here), and campaign-wide
 * progress aggregation across every target's tasks.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

const getCampaignByIdMock = mock.fn(async (id: string): Promise<{ id: string; facebook_page_id: string | null } | null> => {
  if (id === "manual-campaign") return { id: "manual-campaign", facebook_page_id: null };
  return { id: "c1", facebook_page_id: "page-1" };
});
mock.module("./seedingCampaign.service", {
  namedExports: { getCampaignById: getCampaignByIdMock },
});

/** Phase 2K-BU — quickCaptureTargetFromUrl's own reference get-or-create
 * step is mocked out entirely (same one-level-removed-dependency
 * convention as getCampaignById above) — its own behavior already has
 * dedicated coverage in facebookManualContent.service.test.ts; here we
 * only exercise this module's own orchestration/detection logic.
 * parseFacebookContentUrl is deliberately left REAL (unmocked) — a pure
 * function, already independently tested, and using the real
 * implementation here proves the orchestration against genuine URL
 * parsing rather than a stubbed shortcut. */
const getOrCreateManualContentReferenceMock = mock.fn(
  async (input: { facebookObjectId: string; sourceType: string; permalinkUrl: string }) => ({
    reference: {
      id: `ref-for-${input.facebookObjectId}`,
      source_type: input.sourceType,
      source_label: null,
      facebook_object_id: input.facebookObjectId,
      permalink_url: input.permalinkUrl,
    },
    created: true,
  })
);
mock.module("@/lib/facebookTools/facebookManualContent.service", {
  namedExports: { getOrCreateManualContentReference: getOrCreateManualContentReferenceMock },
});

interface FakePost {
  id: string;
  facebook_page_id: string;
  facebook_post_id: string;
}

interface FakeManualRef {
  id: string;
  source_type: string;
  source_label: string | null;
  facebook_object_id: string;
}

interface FakeTargetRow {
  id: string;
  campaign_id: string;
  facebook_page_post_id?: string | null;
  manual_content_reference_id?: string | null;
  facebook_post_id: string;
}

/** Models facebook_page_posts / facebook_manual_content_references
 * (read-only lookup by id) + seeding_campaign_targets (select existing /
 * insert) + seeding_tasks (count:"exact",head:true per status, for
 * progress aggregation). */
function makeClient(opts: {
  posts?: FakePost[];
  manualRefs?: FakeManualRef[];
  existingTargets?: FakeTargetRow[];
  tasksByStatus?: Record<string, number>;
}) {
  const posts = opts.posts ?? [];
  const manualRefs = opts.manualRefs ?? [];
  const targets = [...(opts.existingTargets ?? [])];
  const tasksByStatus = opts.tasksByStatus ?? {};

  return {
    from(table: string) {
      if (table === "facebook_page_posts") {
        return {
          select(_cols: string) {
            const resolved = Promise.resolve({ data: posts, error: null });
            const builder = {
              in(_col: string, ids: string[]) {
                return Promise.resolve({ data: posts.filter((p) => ids.includes(p.id)), error: null });
              },
              eq(_col: string, id: string) {
                return { maybeSingle: () => Promise.resolve({ data: posts.find((p) => p.id === id) ?? null, error: null }) };
              },
              // Phase 2K-BU — quickCaptureTargetFromUrl's own cross-check
              // is a bare, unfiltered select (fetch-all-then-check-in-JS,
              // same convention as importManualContentUrls' own dedup
              // check) — a thenable so `await ...select(...)` with no
              // further chaining resolves directly to every post, while
              // .in()/.eq() above stay untouched for existing callers.
              then: resolved.then.bind(resolved),
              catch: resolved.catch.bind(resolved),
            };
            return builder;
          },
        };
      }
      if (table === "facebook_manual_content_references") {
        return {
          select(_cols: string) {
            return {
              in(_col: string, ids: string[]) {
                return Promise.resolve({ data: manualRefs.filter((r) => ids.includes(r.id)), error: null });
              },
            };
          },
        };
      }
      if (table === "seeding_campaign_targets") {
        return {
          select(_cols: string) {
            const builder = {
              eq(col: string, val: string) {
                const afterFirst = targets.filter((t) => (t as unknown as Record<string, unknown>)[col] === val);
                const resolved = Promise.resolve({ data: afterFirst, error: null });
                return {
                  // Phase 2K-BU — findExistingTarget's own second .eq()
                  // (campaign_id + facebook_page_post_id/
                  // manual_content_reference_id) narrows further and ends
                  // in .maybeSingle(); every EXISTING caller only ever
                  // chains one .eq(campaign_id) and awaits it directly
                  // (addTargetsToCampaign) — both stay supported since
                  // this object is simultaneously thenable and chainable.
                  eq(col2: string, val2: string) {
                    const afterSecond = afterFirst.filter((t) => (t as unknown as Record<string, unknown>)[col2] === val2);
                    return { maybeSingle: () => Promise.resolve({ data: afterSecond[0] ?? null, error: null }) };
                  },
                  then: resolved.then.bind(resolved),
                  catch: resolved.catch.bind(resolved),
                };
              },
            };
            return builder;
          },
          insert(values: Record<string, unknown>[]) {
            const rows = values.map((v, i) => ({ id: `row-${targets.length + i + 1}`, ...v })) as unknown as FakeTargetRow[];
            targets.push(...rows);
            return { select: () => Promise.resolve({ data: rows, error: null }) };
          },
        };
      }
      if (table === "seeding_tasks") {
        return {
          select(_cols: string) {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
                const count =
                  "status" in filters
                    ? tasksByStatus[filters.status as string] ?? 0
                    : Object.values(tasksByStatus).reduce((a, b) => a + b, 0);
                return Promise.resolve({ count, error: null }).then(resolve, reject);
              },
            };
            return builder;
          },
        };
      }
      throw new Error(`Unexpected table in test fake: ${table}`);
    },
  } as never;
}

test("addTargetsToCampaign: adds a single target", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({ posts: [{ id: "post-1", facebook_page_id: "page-1", facebook_post_id: "fb-1" }] });

  const result = await addTargetsToCampaign("c1", ["post-1"], "staff-1", client);

  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].facebook_page_post_id, "post-1");
  assert.deepEqual(result.alreadyTargeted, []);
});

test("addTargetsToCampaign: adds multiple targets in one call", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    posts: [
      { id: "post-1", facebook_page_id: "page-1", facebook_post_id: "fb-1" },
      { id: "post-2", facebook_page_id: "page-1", facebook_post_id: "fb-2" },
      { id: "post-3", facebook_page_id: "page-1", facebook_post_id: "fb-3" },
    ],
  });

  const result = await addTargetsToCampaign("c1", ["post-1", "post-2", "post-3"], "staff-1", client);

  assert.equal(result.added.length, 3);
});

test("addTargetsToCampaign: a post already targeted is silently skipped, not an error, and reported in alreadyTargeted", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    posts: [
      { id: "post-1", facebook_page_id: "page-1", facebook_post_id: "fb-1" },
      { id: "post-2", facebook_page_id: "page-1", facebook_post_id: "fb-2" },
    ],
    existingTargets: [{ id: "tg-existing", campaign_id: "c1", facebook_page_post_id: "post-1", facebook_post_id: "fb-1" }],
  });

  const result = await addTargetsToCampaign("c1", ["post-1", "post-2"], "staff-1", client);

  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].facebook_page_post_id, "post-2");
  assert.deepEqual(result.alreadyTargeted, ["post-1"]);
});

test("addTargetsToCampaign: a post from a different Facebook Page than the campaign is rejected, no insert attempted", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({ posts: [{ id: "post-x", facebook_page_id: "OTHER-PAGE", facebook_post_id: "fb-x" }] });

  await assert.rejects(
    () => addTargetsToCampaign("c1", ["post-x"], "staff-1", client),
    /different Facebook Page/
  );
});

test("addTargetsToCampaign: an unknown facebook_page_post_id is rejected", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({ posts: [] });

  await assert.rejects(() => addTargetsToCampaign("c1", ["does-not-exist"], "staff-1", client), /not found in cache/);
});

/**
 * Phase 2J-D — manual-reference targets (Architecture B). The
 * manualContentReferenceIds param is new and trailing; every test above
 * this block never passes it, proving the Page-only path is byte-for-byte
 * unaffected (confirmed passing, unchanged, above).
 */

test("addTargetsToCampaign: a manual-only campaign accepts a manual content reference target", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [{ id: "ref-1", source_type: "Group", source_label: "Nhóm bán vòng", facebook_object_id: "999" }],
  });

  const result = await addTargetsToCampaign("manual-campaign", [], "staff-1", client, ["ref-1"]);

  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].manual_content_reference_id, "ref-1");
  assert.equal(result.added[0].facebook_post_id, "999");
  assert.deepEqual(result.alreadyTargeted, []);
});

test("addTargetsToCampaign: a mixed campaign accepts both a Page target and a manual reference target in one call", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    posts: [{ id: "post-1", facebook_page_id: "page-1", facebook_post_id: "fb-1" }],
    manualRefs: [{ id: "ref-1", source_type: "Personal", source_label: null, facebook_object_id: "999" }],
  });

  const result = await addTargetsToCampaign("c1", ["post-1"], "staff-1", client, ["ref-1"]);

  assert.equal(result.added.length, 2);
  const byPage = result.added.find((t) => t.facebook_page_post_id === "post-1");
  const byManual = result.added.find((t) => t.manual_content_reference_id === "ref-1");
  assert.ok(byPage, "Page target must be added");
  assert.ok(byManual, "manual reference target must be added");
});

test("addTargetsToCampaign: an already-targeted manual reference is silently skipped, reported in alreadyTargeted", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [{ id: "ref-1", source_type: "Group", source_label: null, facebook_object_id: "999" }],
    existingTargets: [{ id: "tg-existing", campaign_id: "manual-campaign", manual_content_reference_id: "ref-1", facebook_post_id: "999" }],
  });

  const result = await addTargetsToCampaign("manual-campaign", [], "staff-1", client, ["ref-1"]);

  assert.equal(result.added.length, 0);
  assert.deepEqual(result.alreadyTargeted, ["ref-1"]);
});

test("addTargetsToCampaign: an unknown manual_content_reference_id is rejected, no insert attempted", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({ manualRefs: [] });

  await assert.rejects(
    () => addTargetsToCampaign("manual-campaign", [], "staff-1", client, ["does-not-exist"]),
    /Manual content reference\(s\) not found/
  );
});

test("addTargetsToCampaign: a Page target cannot be added to a manual-only campaign (no connected Page)", async () => {
  const { addTargetsToCampaign } = await import("./seedingCampaignTarget.service");
  const client = makeClient({ posts: [{ id: "post-1", facebook_page_id: "page-1", facebook_post_id: "fb-1" }] });

  await assert.rejects(
    () => addTargetsToCampaign("manual-campaign", ["post-1"], "staff-1", client),
    /không gắn với Facebook Page/
  );
});

test("getCampaignProgress: aggregates every task status across all targets, Failed never folded into Done", async () => {
  const { getCampaignProgress } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    tasksByStatus: { Pending: 3, "In Progress": 1, Done: 8, Failed: 2, Skipped: 1, Cancelled: 0 },
  });

  const progress = await getCampaignProgress("c1", client);

  assert.equal(progress.total, 15);
  assert.equal(progress.pending, 3);
  assert.equal(progress.inProgress, 1);
  assert.equal(progress.done, 8);
  assert.equal(progress.failed, 2);
  assert.equal(progress.skipped, 1);
  assert.equal(progress.cancelled, 0);
  assert.notEqual(progress.done, progress.total, "Failed/Skipped/Pending must not be silently counted as Done");
});

/** Phase 2K-BU — Personal Post Quick Capture: paste-a-URL, get-a-target,
 * in one call. getCampaignByIdMock resolves "c1" -> facebook_page_id
 * "page-1" (a Connected Page campaign) and "manual-campaign" ->
 * facebook_page_id null (manual-only). */

test("quickCaptureTargetFromUrl: (A) a Personal pfbid post URL becomes a manual target, source Personal, idConfidence 'pfbid'", async () => {
  getOrCreateManualContentReferenceMock.mock.resetCalls();
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [
      {
        id: "ref-for-pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl",
        source_type: "Personal",
        source_label: null,
        facebook_object_id: "pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl",
      },
    ],
  });

  const result = await quickCaptureTargetFromUrl(
    "c1",
    "https://www.facebook.com/haozvu/posts/pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl",
    "staff-1",
    client
  );

  assert.equal(result.outcome, "manual_target_added");
  assert.equal(result.detectedSourceType, "Personal");
  assert.equal(result.idConfidence, "pfbid");
  assert.ok(result.target);
});

test("quickCaptureTargetFromUrl: (B) a Personal /photo?fbid=... URL becomes a manual target, idConfidence 'numeric'", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [{ id: "ref-for-28251318111128780", source_type: "Personal", source_label: null, facebook_object_id: "28251318111128780" }],
  });

  const result = await quickCaptureTargetFromUrl(
    "c1",
    "https://www.facebook.com/photo?fbid=28251318111128780&set=a.455418657812099",
    "staff-1",
    client
  );

  assert.equal(result.outcome, "manual_target_added");
  assert.equal(result.detectedSourceType, "Personal");
  assert.equal(result.idConfidence, "numeric");
});

test("quickCaptureTargetFromUrl: (C) a /share/p/{token}/ URL becomes a manual target, idConfidence 'share-token'", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [{ id: "ref-for-1GRrcaBhTJ", source_type: "Personal", source_label: null, facebook_object_id: "1GRrcaBhTJ" }],
  });

  const result = await quickCaptureTargetFromUrl("c1", "https://www.facebook.com/share/p/1GRrcaBhTJ/", "staff-1", client);

  assert.equal(result.outcome, "manual_target_added");
  assert.equal(result.idConfidence, "share-token");
});

test("quickCaptureTargetFromUrl: (D) a URL matching an already-known Page post (composite facebook_post_id) routes to the Page workflow, not a manual reference", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    posts: [{ id: "post-1", facebook_page_id: "page-1", facebook_post_id: "page-1_1081544220637236" }],
  });

  const result = await quickCaptureTargetFromUrl(
    "c1",
    "https://www.facebook.com/1533731125418541/posts/1081544220637236",
    "staff-1",
    client
  );

  assert.equal(result.outcome, "page_target_added");
  assert.equal(result.detectedSourceType, "Page");
  assert.equal(result.target?.facebook_page_post_id, "post-1");
});

test("quickCaptureTargetFromUrl: (D2) a Page match belonging to a DIFFERENT Page than this campaign is rejected, same cross-Page rule addTargetsToCampaign already enforces", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    posts: [{ id: "post-1", facebook_page_id: "some-other-page", facebook_post_id: "some-other-page_1081544220637236" }],
  });

  await assert.rejects(
    () => quickCaptureTargetFromUrl("c1", "https://www.facebook.com/x/posts/1081544220637236", "staff-1", client),
    /Facebook Page/
  );
});

test("quickCaptureTargetFromUrl: (E) a real Group post URL becomes a Group manual target, source_type never silently coerced to Personal", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [{ id: "ref-for-987654321", source_type: "Group", source_label: null, facebook_object_id: "987654321" }],
  });

  const result = await quickCaptureTargetFromUrl(
    "c1",
    "https://www.facebook.com/groups/123456789/posts/987654321/",
    "staff-1",
    client
  );

  assert.equal(result.outcome, "manual_target_added");
  assert.equal(result.detectedSourceType, "Group");
});

test("quickCaptureTargetFromUrl: (E2) a Group URL with sourceTypeOverride 'Personal' is rejected before any write", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({});

  await assert.rejects(
    () =>
      quickCaptureTargetFromUrl(
        "c1",
        "https://www.facebook.com/groups/123456789/posts/987654321/",
        "staff-1",
        client,
        "Personal"
      ),
    /Nhóm/
  );
});

test("quickCaptureTargetFromUrl: (F) pasting the exact same URL twice is idempotent — second call reports already_targeted, never a second target row", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [{ id: "ref-for-28251318111128780", source_type: "Personal", source_label: null, facebook_object_id: "28251318111128780" }],
  });
  const url = "https://www.facebook.com/photo?fbid=28251318111128780&set=a.1";

  const first = await quickCaptureTargetFromUrl("c1", url, "staff-1", client);
  const second = await quickCaptureTargetFromUrl("c1", url, "staff-1", client);

  assert.equal(first.outcome, "manual_target_added");
  assert.equal(second.outcome, "manual_target_already_targeted");
  assert.equal(first.target?.id, second.target?.id, "must resolve to the SAME target row, never a duplicate");
});

test("quickCaptureTargetFromUrl: (G) the same underlying post pasted via a share link, then via its canonical pfbid link, produces TWO separate targets — a known, honestly-reported limitation (share-token identity != canonical post identity, no network fetch is ever performed to unify them)", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    manualRefs: [
      { id: "ref-for-1GRrcaBhTJ", source_type: "Personal", source_label: null, facebook_object_id: "1GRrcaBhTJ" },
      {
        id: "ref-for-pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl",
        source_type: "Personal",
        source_label: null,
        facebook_object_id: "pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl",
      },
    ],
  });

  const viaShare = await quickCaptureTargetFromUrl("c1", "https://www.facebook.com/share/p/1GRrcaBhTJ/", "staff-1", client);
  const viaCanonical = await quickCaptureTargetFromUrl(
    "c1",
    "https://www.facebook.com/haozvu/posts/pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl",
    "staff-1",
    client
  );

  assert.equal(viaShare.outcome, "manual_target_added");
  assert.equal(viaCanonical.outcome, "manual_target_added");
  assert.notEqual(viaShare.target?.id, viaCanonical.target?.id);
});

test("quickCaptureTargetFromUrl: (H) an invalid/unparseable URL is rejected before any write, honest reason surfaced", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({});

  await assert.rejects(() => quickCaptureTargetFromUrl("c1", "not a url at all", "staff-1", client), /không hợp lệ/);
});

test("quickCaptureTargetFromUrl: (I) an unresolvable-but-Facebook-domain URL shape (permalink.php) is rejected, never guessed", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({});

  await assert.rejects(
    () =>
      quickCaptureTargetFromUrl(
        "c1",
        "https://www.facebook.com/permalink.php?story_fbid=1533408038784183&id=1711826985696084",
        "staff-1",
        client
      ),
    /chưa được hỗ trợ/
  );
});

test("quickCaptureTargetFromUrl: a resolved Page match cannot be overridden to Personal/Group via sourceTypeOverride", async () => {
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({
    posts: [{ id: "post-1", facebook_page_id: "page-1", facebook_post_id: "page-1_1081544220637236" }],
  });

  await assert.rejects(
    () =>
      quickCaptureTargetFromUrl("c1", "https://www.facebook.com/x/posts/1081544220637236", "staff-1", client, "Personal"),
    /Page đã kết nối/
  );
});

test("quickCaptureTargetFromUrl: a nonexistent campaign is rejected before any parsing/write", async () => {
  getCampaignByIdMock.mock.mockImplementationOnce(async () => null);
  const { quickCaptureTargetFromUrl } = await import("./seedingCampaignTarget.service");
  const client = makeClient({});

  await assert.rejects(
    () => quickCaptureTargetFromUrl("missing-campaign", "https://www.facebook.com/x/posts/123", "staff-1", client),
    /Không tìm thấy campaign/
  );
});
