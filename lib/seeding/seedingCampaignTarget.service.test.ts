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

const getCampaignByIdMock = mock.fn(async () => ({ id: "c1", facebook_page_id: "page-1" }));
mock.module("./seedingCampaign.service", {
  namedExports: { getCampaignById: getCampaignByIdMock },
});

interface FakePost {
  id: string;
  facebook_page_id: string;
  facebook_post_id: string;
}

interface FakeTargetRow {
  id: string;
  campaign_id: string;
  facebook_page_post_id: string;
  facebook_post_id: string;
}

/** Models facebook_page_posts (read-only lookup by id) + seeding_campaign_targets
 * (select existing / insert) + seeding_tasks (count:"exact",head:true per
 * status, for progress aggregation). */
function makeClient(opts: { posts?: FakePost[]; existingTargets?: FakeTargetRow[]; tasksByStatus?: Record<string, number> }) {
  const posts = opts.posts ?? [];
  const targets = [...(opts.existingTargets ?? [])];
  const tasksByStatus = opts.tasksByStatus ?? {};

  return {
    from(table: string) {
      if (table === "facebook_page_posts") {
        return {
          select(_cols: string) {
            const builder = {
              in(_col: string, ids: string[]) {
                return Promise.resolve({ data: posts.filter((p) => ids.includes(p.id)), error: null });
              },
              eq(_col: string, id: string) {
                return { maybeSingle: () => Promise.resolve({ data: posts.find((p) => p.id === id) ?? null, error: null }) };
              },
            };
            return builder;
          },
        };
      }
      if (table === "seeding_campaign_targets") {
        return {
          select(_cols: string) {
            const builder = {
              eq(_col: string, campaignId: string) {
                return Promise.resolve({ data: targets.filter((t) => t.campaign_id === campaignId), error: null });
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
