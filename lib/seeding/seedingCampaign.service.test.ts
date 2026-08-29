import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2G (M2) — server-side campaign lifecycle enforcement. Mocks
 * activityLog only (not this module's concern); everything else runs
 * against a small chainable fake Supabase client mirroring the shape
 * already established in seedingEvidenceReconciliation.service.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

/** Phase 2K-BP — reassignCampaignPage's own dependency: never trusts a
 * client-supplied facebook_page_id directly, always resolves it through
 * getPageByFacebookPageId first. Mocked here (not routed through the
 * fake client above) the same way seedingDirectComment.service.test.ts
 * already mocks this exact module. */
const getPageByFacebookPageIdMock = mock.fn(async (facebookPageId: string) =>
  facebookPageId === "fb-page-missing" ? null : { id: "page-row", facebook_page_id: facebookPageId, page_name: "Page mới", status: "Connected" }
);
mock.module("@/lib/facebookTools/facebookPage.service", {
  namedExports: { getPageByFacebookPageId: getPageByFacebookPageIdMock },
});

async function loadModule() {
  return import("./seedingCampaign.service");
}

function makeClient(currentCampaign: { id: string; status: string } | null, updateResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const updateCalls: { changes: unknown }[] = [];

  function chainable(resolveValue: unknown) {
    const builder: Record<string, unknown> = {};
    ["eq", "select"].forEach((method) => {
      builder[method] = () => builder;
    });
    builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(resolveValue).then(resolve, reject);
    builder.maybeSingle = () => Promise.resolve({ data: currentCampaign, error: null });
    builder.single = () => Promise.resolve(updateResult.error ? { data: null, error: updateResult.error } : { data: updateResult.data ?? currentCampaign, error: null });
    return builder;
  }

  return {
    from() {
      return {
        select: () => chainable({}),
        update: (changes: unknown) => {
          updateCalls.push({ changes });
          return chainable({});
        },
      };
    },
    __updateCalls: updateCalls,
  } as never;
}

test("updateCampaign: Active -> Completed is allowed", async () => {
  const { updateCampaign } = await loadModule();
  const client = makeClient({ id: "c1", status: "Active" });
  await updateCampaign("c1", { status: "Completed" }, "staff-1", client);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 1);
});

test("updateCampaign: Completed -> Active (reopen) is allowed", async () => {
  const { updateCampaign } = await loadModule();
  const client = makeClient({ id: "c1", status: "Completed" });
  await updateCampaign("c1", { status: "Active" }, "staff-1", client);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 1);
});

test("updateCampaign: Draft -> Active is allowed", async () => {
  const { updateCampaign } = await loadModule();
  const client = makeClient({ id: "c1", status: "Draft" });
  await updateCampaign("c1", { status: "Active" }, "staff-1", client);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 1);
});

test("updateCampaign: Draft -> Completed (skip-ahead) is rejected server-side", async () => {
  const { updateCampaign } = await loadModule();
  const { SeedingValidationError } = await import("./seeding.errors");
  const client = makeClient({ id: "c1", status: "Draft" });
  await assert.rejects(() => updateCampaign("c1", { status: "Completed" }, "staff-1", client), SeedingValidationError);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 0, "no write must happen on a rejected transition");
});

test("updateCampaign: Completed -> Draft is rejected server-side", async () => {
  const { updateCampaign } = await loadModule();
  const { SeedingValidationError } = await import("./seeding.errors");
  const client = makeClient({ id: "c1", status: "Completed" });
  await assert.rejects(() => updateCampaign("c1", { status: "Draft" }, "staff-1", client), SeedingValidationError);
});

test("updateCampaign: Active -> Draft (backward) is rejected server-side", async () => {
  const { updateCampaign } = await loadModule();
  const { SeedingValidationError } = await import("./seeding.errors");
  const client = makeClient({ id: "c1", status: "Active" });
  await assert.rejects(() => updateCampaign("c1", { status: "Draft" }, "staff-1", client), SeedingValidationError);
});

test("updateCampaign: rejection error message does not leak internals (safe app error)", async () => {
  const { updateCampaign } = await loadModule();
  const client = makeClient({ id: "c1", status: "Draft" });
  try {
    await updateCampaign("c1", { status: "Completed" }, "staff-1", client);
    assert.fail("expected rejection");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Invalid campaign status transition: Draft -> Completed/);
    assert.doesNotMatch(error.message, /stack|SQL|supabase|postgres/i);
  }
});

test("updateCampaign: resending the current status (no-op) is allowed, not treated as an invalid transition", async () => {
  const { updateCampaign } = await loadModule();
  const client = makeClient({ id: "c1", status: "Active" });
  await updateCampaign("c1", { status: "Active" }, "staff-1", client);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 1);
});

test("updateCampaign: editing name/objective without a status field never triggers transition validation", async () => {
  const { updateCampaign } = await loadModule();
  const client = makeClient({ id: "c1", status: "Completed" });
  await updateCampaign("c1", { name: "Renamed campaign" }, "staff-1", client);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 1);
});

test("updateCampaign: campaign not found throws before any write", async () => {
  const { updateCampaign } = await loadModule();
  const client = makeClient(null);
  await assert.rejects(() => updateCampaign("missing", { status: "Active" }, "staff-1", client), /not found/i);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 0);
});

/**
 * Phase 2J-D — createCampaign now supports a manual-only campaign
 * (facebook_page_id omitted/null, Architecture B) alongside the existing
 * Page-backed path, which stays byte-for-byte unchanged.
 */

interface FakeResult {
  data: unknown;
  error?: unknown;
}

function makeCreateClient(perTableSequence: Record<string, FakeResult[]>) {
  const counters: Record<string, number> = {};
  const insertedRows: { table: string; values: unknown }[] = [];
  return {
    from(table: string) {
      const seq = perTableSequence[table];
      if (!seq) throw new Error(`Unexpected table in test fake: ${table}`);
      return {
        select() {
          const idx = counters[`${table}:select`] ?? 0;
          counters[`${table}:select`] = idx + 1;
          const result = seq[idx] ?? seq[seq.length - 1];
          return { eq: () => ({ maybeSingle: () => Promise.resolve({ error: null, ...result }) }) };
        },
        insert(values: unknown) {
          insertedRows.push({ table, values });
          const idx = counters[`${table}:insert`] ?? 0;
          counters[`${table}:insert`] = idx + 1;
          const result = seq[idx] ?? seq[seq.length - 1];
          return { select: () => ({ single: () => Promise.resolve({ error: null, ...result }) }) };
        },
      };
    },
    __insertedRows: insertedRows,
  } as never;
}

test("createCampaign: a Page-backed campaign stores the real facebook_page_id, unchanged from before this phase", async () => {
  const { createCampaign } = await loadModule();
  const client = makeCreateClient({
    facebook_page_posts: [{ data: { message: "Hàng mới về" } }],
    seeding_campaigns: [{ data: { id: "camp-1", facebook_page_id: "page-1" } }],
  });

  const campaign = await createCampaign(
    { name: "Campaign A", facebook_page_id: "page-1", objective: "Tăng tương tác", targetFacebookPagePostIds: ["post-1"] },
    "staff-1",
    client
  );

  assert.equal(campaign.facebook_page_id, "page-1");
  const inserted = (client as unknown as { __insertedRows: { table: string; values: { facebook_page_id: unknown; post_content_snapshot: unknown } }[] })
    .__insertedRows[0].values;
  assert.equal(inserted.facebook_page_id, "page-1");
  assert.equal(inserted.post_content_snapshot, "Hàng mới về");
});

test("createCampaign: a manual-only campaign (no facebook_page_id) is created with a null Page id — no synthetic Page row involved", async () => {
  const { createCampaign } = await loadModule();
  const client = makeCreateClient({
    facebook_manual_content_references: [{ data: { message: null } }],
    seeding_campaigns: [{ data: { id: "camp-2", facebook_page_id: null } }],
  });

  const campaign = await createCampaign(
    { name: "Manual campaign", objective: "Tăng tương tác", targetManualContentReferenceIds: ["ref-1"] },
    "staff-1",
    client
  );

  assert.equal(campaign.facebook_page_id, null);
  const inserted = (client as unknown as { __insertedRows: { table: string; values: { facebook_page_id: unknown; post_content_snapshot: unknown } }[] })
    .__insertedRows[0].values;
  assert.equal(inserted.facebook_page_id, null);
  // Honest — no token can read Personal/Group content, so message is null
  // and the snapshot must never be fabricated.
  assert.equal(inserted.post_content_snapshot, null);
});

/** Phase 2K-BP — Reassign Connected Page. */

test("reassignCampaignPage: (B)(C) Page A -> Page B succeeds, the new facebook_page_id is persisted", async () => {
  const { reassignCampaignPage } = await loadModule();
  const client = makeClient(
    { id: "camp-1", status: "Active", facebook_page_id: "fb-page-a" } as never,
    { data: { id: "camp-1", status: "Active", facebook_page_id: "fb-page-b" }, error: null }
  );

  const result = await reassignCampaignPage("camp-1", "fb-page-b", "staff-1", client);

  assert.equal(result.facebook_page_id, "fb-page-b");
  assert.equal((client as never as { __updateCalls: { changes: unknown }[] }).__updateCalls.length, 1);
  assert.deepEqual((client as never as { __updateCalls: { changes: unknown }[] }).__updateCalls[0].changes, { facebook_page_id: "fb-page-b" });
});

test("reassignCampaignPage: (D)(F) a nonexistent/unconnected Page is rejected server-side — never trusts the client-supplied id, no write happens", async () => {
  const { reassignCampaignPage } = await loadModule();
  const { SeedingValidationError } = await import("./seeding.errors");
  const client = makeClient({ id: "camp-1", status: "Active", facebook_page_id: "fb-page-a" } as never);

  await assert.rejects(() => reassignCampaignPage("camp-1", "fb-page-missing", "staff-1", client), SeedingValidationError);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 0, "no write must happen when the selected Page cannot be verified");
});

test("reassignCampaignPage: an empty/missing facebook_page_id is rejected before even reading the campaign", async () => {
  const { reassignCampaignPage } = await loadModule();
  const { SeedingValidationError } = await import("./seeding.errors");
  const client = makeClient({ id: "camp-1", status: "Active", facebook_page_id: "fb-page-a" } as never);

  await assert.rejects(() => reassignCampaignPage("camp-1", "", "staff-1", client), SeedingValidationError);
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 0);
});

test("reassignCampaignPage: a nonexistent campaign is rejected", async () => {
  const { reassignCampaignPage } = await loadModule();
  const { SeedingValidationError } = await import("./seeding.errors");
  const client = makeClient(null);

  await assert.rejects(() => reassignCampaignPage("missing-campaign", "fb-page-b", "staff-1", client), SeedingValidationError);
});

test("reassignCampaignPage: (L) reassigning to the campaign's own current Page is idempotent — no write, no side effect", async () => {
  const { reassignCampaignPage } = await loadModule();
  const client = makeClient({ id: "camp-1", status: "Active", facebook_page_id: "fb-page-a" } as never);

  const result = await reassignCampaignPage("camp-1", "fb-page-a", "staff-1", client);

  assert.equal(result.facebook_page_id, "fb-page-a");
  assert.equal((client as never as { __updateCalls: unknown[] }).__updateCalls.length, 0, "same-Page reassignment must not write");
});

test("reassignCampaignPage: (K) the campaign's Page is unchanged if the underlying DB update fails", async () => {
  const { reassignCampaignPage } = await loadModule();
  const client = makeClient(
    { id: "camp-1", status: "Active", facebook_page_id: "fb-page-a" } as never,
    { data: null, error: new Error("db write failed") }
  );

  await assert.rejects(() => reassignCampaignPage("camp-1", "fb-page-b", "staff-1", client));
});
