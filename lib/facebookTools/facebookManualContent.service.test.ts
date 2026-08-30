import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2J-D — facebook_manual_content_references batch import. Same
 * per-table sequenced-fake-client pattern as
 * lib/seeding/seedingTask.service.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakeResult {
  data: unknown;
  error?: unknown;
}

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

test("importManualContentUrls: multiple valid, distinct URLs are all created", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [
      { data: [] }, // existing-ids lookup: nothing yet
      { data: { id: "ref-1" } }, // insert #1
      { data: { id: "ref-2" } }, // insert #2
    ],
  });

  const result = await importManualContentUrls(
    {
      urls: [
        "https://www.facebook.com/123/posts/111",
        "https://www.facebook.com/123/videos/222",
      ],
      source_type: "Group",
      source_label: "Nhóm bán vòng",
    },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 2);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.failed.length, 0);
});

test("importManualContentUrls: duplicate object id within the same batch is skipped, not double-created", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [
      { data: [] },
      { data: { id: "ref-1" } },
    ],
  });

  const result = await importManualContentUrls(
    {
      urls: [
        "https://www.facebook.com/123/posts/111",
        "https://www.facebook.com/123/posts/111/", // same object id, trailing slash
      ],
      source_type: "Personal",
    },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /lượt nhập/);
});

test("importManualContentUrls: duplicate against an existing reference is skipped, never re-created", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [{ data: [{ facebook_object_id: "111" }] }],
  });

  const result = await importManualContentUrls(
    { urls: ["https://www.facebook.com/123/posts/111"], source_type: "Personal" },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /đã được nhập/);
});

test("importManualContentUrls: an unsupported URL shape is reported as failed with the parser's own honest reason, never guessed", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({ facebook_manual_content_references: [{ data: [] }] });

  const result = await importManualContentUrls(
    { urls: ["https://www.facebook.com/permalink.php?story_fbid=1&id=2"], source_type: "Group" },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 0);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason, /chưa được hỗ trợ/);
});

test("importManualContentUrls: honest counts across a mixed batch (created/skipped/failed)", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [
      { data: [{ facebook_object_id: "999" }] }, // "999" already exists
      { data: { id: "ref-new" } }, // insert for the one genuinely new URL
    ],
  });

  const result = await importManualContentUrls(
    {
      urls: [
        "https://www.facebook.com/123/posts/999", // duplicate vs existing
        "not a url", // failed
        "https://www.facebook.com/123/posts/555", // created
      ],
      source_type: "Group",
    },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.failed.length, 1);
});

test("importManualContentUrls: a raw DB insert error is never leaked verbatim to the caller", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [
      { data: [] },
      { data: null, error: new Error('duplicate key value violates unique constraint "uq_facebook_manual_content_references_object_id"') },
    ],
  });

  const result = await importManualContentUrls(
    { urls: ["https://www.facebook.com/123/posts/111"], source_type: "Group" },
    "staff-1",
    client
  );

  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].reason, "Không thể lưu URL này");
  assert.ok(!result.failed[0].reason.includes("constraint"));
});

test("importManualContentUrls: rejects an empty URL batch before any write", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({});
  await assert.rejects(
    () => importManualContentUrls({ urls: [], source_type: "Group" }, "staff-1", client),
    /Vui lòng nhập/
  );
});

/**
 * Phase 2J-D1 — real Group permalink parsing + source_type cross-check.
 */

test("importManualContentUrls: source_type Group + a real Group permalink is created successfully", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [{ data: [] }, { data: { id: "ref-group-1" } }],
  });

  const result = await importManualContentUrls(
    { urls: ["https://www.facebook.com/groups/123456789/posts/987654321/"], source_type: "Group" },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.failed.length, 0);
});

test("importManualContentUrls: source_type Personal + a real Group permalink is rejected honestly, never silently imported", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({ facebook_manual_content_references: [{ data: [] }] });

  const result = await importManualContentUrls(
    { urls: ["https://www.facebook.com/groups/123456789/posts/987654321/"], source_type: "Personal" },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 0);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason, /Nhóm/);
});

test("importManualContentUrls: a non-Group URL under source_type Group still succeeds, unchanged from before this fix", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [{ data: [] }, { data: { id: "ref-1" } }],
  });

  const result = await importManualContentUrls(
    { urls: ["https://www.facebook.com/123/posts/111"], source_type: "Group" },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.failed.length, 0);
});

test("importManualContentUrls: duplicate handling still works for Group permalink imports (dedup by object id, not URL shape)", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({
    facebook_manual_content_references: [{ data: [] }, { data: { id: "ref-group-2" } }],
  });

  const result = await importManualContentUrls(
    {
      urls: [
        "https://www.facebook.com/groups/123456789/posts/555555555/",
        "https://www.facebook.com/groups/123456789/permalink/555555555/", // same post-id, different URL shape
      ],
      source_type: "Group",
    },
    "staff-1",
    client
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /lượt nhập/);
});

test("importManualContentUrls: rejects an invalid source_type before any write", async () => {
  const { importManualContentUrls } = await import("./facebookManualContent.service");
  const client = makeClient({});
  await assert.rejects(
    () =>
      importManualContentUrls(
        { urls: ["https://www.facebook.com/123/posts/111"], source_type: "Page" as never },
        "staff-1",
        client
      ),
    /source_type không hợp lệ/
  );
});

/** Phase 2K-BU — Personal Post Quick Capture's single-URL get-or-create,
 * used by the campaign-target orchestration in
 * seedingCampaignTarget.service.ts. Same identity (facebook_object_id) as
 * the batch importer above, just a single-row read-then-maybe-insert
 * instead of a whole-batch pass. */

test("getOrCreateManualContentReference: no existing row -> creates a new one, tagged 'Quick Capture'", async () => {
  const { getOrCreateManualContentReference } = await import("./facebookManualContent.service");
  const inserted = { id: "ref-new", source_type: "Personal", facebook_object_id: "pfbid02abc", permalink_url: "https://www.facebook.com/x/posts/pfbid02abc" };
  const client = makeClient({
    facebook_manual_content_references: [{ data: null }, { data: inserted }],
  });

  const result = await getOrCreateManualContentReference(
    { facebookObjectId: "pfbid02abc", sourceType: "Personal", permalinkUrl: "https://www.facebook.com/x/posts/pfbid02abc" },
    "staff-1",
    client
  );

  assert.equal(result.created, true);
  assert.equal(result.reference.id, "ref-new");
});

test("getOrCreateManualContentReference: an existing row with the same facebook_object_id is reused, never re-inserted", async () => {
  const { getOrCreateManualContentReference } = await import("./facebookManualContent.service");
  const existing = { id: "ref-existing", source_type: "Group", facebook_object_id: "pfbid02abc", permalink_url: "https://www.facebook.com/original-url" };
  const client = makeClient({
    facebook_manual_content_references: [{ data: existing }],
  });

  const result = await getOrCreateManualContentReference(
    { facebookObjectId: "pfbid02abc", sourceType: "Personal", permalinkUrl: "https://www.facebook.com/a-different-share-link" },
    "staff-1",
    client
  );

  assert.equal(result.created, false);
  assert.equal(result.reference.id, "ref-existing");
  // The already-persisted source_type wins — a caller's new "Personal"
  // guess never silently overwrites an existing "Group" reference.
  assert.equal(result.reference.source_type, "Group");
});

/** Phase 2K-BX — Target Card Metadata Fallback & Inline Edit. Only ever
 * writes source_label — never facebook_object_id, source_type,
 * permalink_url, message, or full_picture_url. */

test("updateManualContentReferenceSourceLabel: updates source_label and returns the updated row", async () => {
  const { updateManualContentReferenceSourceLabel } = await import("./facebookManualContent.service");
  const updated = {
    id: "ref-1",
    source_type: "Personal",
    source_label: "Vòng ni 54.6 khách đang quan tâm",
    facebook_object_id: "pfbid02abc",
    permalink_url: "https://www.facebook.com/x/posts/pfbid02abc",
  };
  const client = makeClient({
    facebook_manual_content_references: [{ data: updated }],
  });

  const result = await updateManualContentReferenceSourceLabel("ref-1", "Vòng ni 54.6 khách đang quan tâm", client);

  assert.equal(result.source_label, "Vòng ni 54.6 khách đang quan tâm");
  assert.equal(result.facebook_object_id, "pfbid02abc", "facebook_object_id must never change");
});

test("updateManualContentReferenceSourceLabel: null clears the description (a legitimate, honest state, not an error)", async () => {
  const { updateManualContentReferenceSourceLabel } = await import("./facebookManualContent.service");
  const cleared = {
    id: "ref-1",
    source_type: "Personal",
    source_label: null,
    facebook_object_id: "pfbid02abc",
    permalink_url: "https://www.facebook.com/x/posts/pfbid02abc",
  };
  const client = makeClient({
    facebook_manual_content_references: [{ data: cleared }],
  });

  const result = await updateManualContentReferenceSourceLabel("ref-1", null, client);

  assert.equal(result.source_label, null);
});

/** Phase 2K-BZ (P2 #1) — Content Repository <-> Campaign linkage. Reuses
 * the existing seeding_campaign_targets.manual_content_reference_id FK
 * — no new relationship, no schema change. */

test("getManualContentCampaignUsage: a reference targeted by one campaign returns that campaign", async () => {
  const { getManualContentCampaignUsage } = await import("./facebookManualContent.service");
  const client = makeClient({
    seeding_campaign_targets: [
      { data: [{ manual_content_reference_id: "ref-1", seeding_campaigns: { id: "c1", name: "Campaign A" } }] },
    ],
  });

  const usage = await getManualContentCampaignUsage(["ref-1"], client);

  assert.deepEqual(usage["ref-1"], [{ campaign_id: "c1", campaign_name: "Campaign A" }]);
});

test("getManualContentCampaignUsage: a reference targeted by TWO different campaigns returns both, not just the first", async () => {
  const { getManualContentCampaignUsage } = await import("./facebookManualContent.service");
  const client = makeClient({
    seeding_campaign_targets: [
      {
        data: [
          { manual_content_reference_id: "ref-1", seeding_campaigns: { id: "c1", name: "Campaign A" } },
          { manual_content_reference_id: "ref-1", seeding_campaigns: { id: "c2", name: "Campaign B" } },
        ],
      },
    ],
  });

  const usage = await getManualContentCampaignUsage(["ref-1"], client);

  assert.equal(usage["ref-1"].length, 2);
  assert.deepEqual(
    usage["ref-1"].map((u) => u.campaign_id).sort(),
    ["c1", "c2"]
  );
});

test("getManualContentCampaignUsage: a reference nobody has targeted is simply absent from the map — an honest 'unused' state", async () => {
  const { getManualContentCampaignUsage } = await import("./facebookManualContent.service");
  const client = makeClient({
    seeding_campaign_targets: [{ data: [] }],
  });

  const usage = await getManualContentCampaignUsage(["ref-1"], client);

  assert.equal(usage["ref-1"], undefined);
});

test("getManualContentCampaignUsage: an empty id list returns an empty map without any query", async () => {
  const { getManualContentCampaignUsage } = await import("./facebookManualContent.service");
  const client = makeClient({});

  const usage = await getManualContentCampaignUsage([], client);

  assert.deepEqual(usage, {});
});
