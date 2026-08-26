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
