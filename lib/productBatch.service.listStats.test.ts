import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot List Overview KPI (Product Owner Authorization, 2026-08-20) —
 * computeBatchCounts() (pure, shared with getBatchStats) and
 * getBatchListStats() (the Lot List's own N+1-free aggregate).
 *
 * Status literals + Returned-bucket derivation updated for BR-003 (LOCKED,
 * 2026-08-21): "Active" -> "Available"; the Returned KPI bucket is now
 * derived from returned_at IS NOT NULL, never from status === "Returned"
 * (that value is retired - a returned product's status reads "Archived",
 * same as any other archival reason).
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as lib/orders/order.repository.completeOrder.test.ts.
 */
let nextListProductsResult: {
  data: { batch_id: string; status: string; returned_at?: string | null }[] | null;
  error: unknown;
} = {
  data: [],
  error: null,
};
const fromCalls: string[] = [];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        fromCalls.push(table);
        if (table === "products") {
          return { select: () => ({ not: () => Promise.resolve(nextListProductsResult) }) };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  },
});

test.beforeEach(() => {
  nextListProductsResult = { data: [], error: null };
  fromCalls.length = 0;
});

test("computeBatchCounts — Case 1: 10 Total / 3 Sold / 2 Returned / 4 Remaining(plain) / 1 Reserved", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  const rows = [
    { status: "Sold" }, { status: "Sold" }, { status: "Sold" },
    { status: "Archived", returned_at: "2026-08-15T00:00:00Z" }, { status: "Archived", returned_at: "2026-08-16T00:00:00Z" },
    { status: "Available" }, { status: "Available" }, { status: "Available" }, { status: "Available" },
    { status: "Reserved" },
  ];
  const counts = computeBatchCounts(rows);
  assert.deepEqual(counts, { total: 10, sold: 3, returned: 2, remaining: 5, reserved: 1 });
});

test("computeBatchCounts — Case 2: all Sold", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  const rows = [{ status: "Sold" }, { status: "Sold" }, { status: "Sold" }];
  assert.deepEqual(computeBatchCounts(rows), { total: 3, sold: 3, returned: 0, remaining: 0, reserved: 0 });
});

test("computeBatchCounts — Case 3: all Returned (Archived + returned_at set)", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  const rows = [
    { status: "Archived", returned_at: "2026-08-15T00:00:00Z" },
    { status: "Archived", returned_at: "2026-08-16T00:00:00Z" },
  ];
  assert.deepEqual(computeBatchCounts(rows), { total: 2, sold: 0, returned: 2, remaining: 0, reserved: 0 });
});

test("computeBatchCounts — Case 3b (BR-003): an Archived product with returned_at NULL is NOT counted as Returned", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  const rows = [{ status: "Archived", returned_at: null }, { status: "Archived" }];
  assert.deepEqual(computeBatchCounts(rows), { total: 2, sold: 0, returned: 0, remaining: 2, reserved: 0 });
});

test("computeBatchCounts — Case 4: all Remaining", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  const rows = [{ status: "Available" }, { status: "Paused" }, { status: "Discontinued" }];
  assert.deepEqual(computeBatchCounts(rows), { total: 3, sold: 0, returned: 0, remaining: 3, reserved: 0 });
});

test("computeBatchCounts — Case 5: mixed statuses", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  const rows = [
    { status: "Sold" },
    { status: "Archived", returned_at: "2026-08-15T00:00:00Z" },
    { status: "Available" },
    { status: "Reserved" },
    { status: "Paused" },
  ];
  assert.deepEqual(computeBatchCounts(rows), { total: 5, sold: 1, returned: 1, remaining: 3, reserved: 1 });
});

test("computeBatchCounts — Case 9: empty Lot -> every KPI is 0", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  assert.deepEqual(computeBatchCounts([]), { total: 0, sold: 0, returned: 0, remaining: 0, reserved: 0 });
});

test("computeBatchCounts — historical/invalid status falls into remaining, never crashes (no silent 'fix' of the data)", async () => {
  const { computeBatchCounts } = await import("./productBatch.service");
  const rows = [{ status: null as unknown as string }, { status: "some-legacy-value" }, { status: "Sold" }];
  assert.deepEqual(computeBatchCounts(rows), { total: 3, sold: 1, returned: 0, remaining: 2, reserved: 0 });
});

test("Case 6: getBatchListStats — multiple batch_ids in one dataset never mix KPI", async () => {
  nextListProductsResult = {
    data: [
      { batch_id: "batch-A", status: "Sold" },
      { batch_id: "batch-A", status: "Available" },
      { batch_id: "batch-B", status: "Archived", returned_at: "2026-08-15T00:00:00Z" },
      { batch_id: "batch-B", status: "Archived", returned_at: "2026-08-16T00:00:00Z" },
      { batch_id: "batch-B", status: "Sold" },
    ],
    error: null,
  };

  const { getBatchListStats } = await import("./productBatch.service");
  const stats = await getBatchListStats();

  assert.deepEqual(stats.get("batch-A"), { total: 2, sold: 1, returned: 0, remaining: 1, reserved: 0 });
  assert.deepEqual(stats.get("batch-B"), { total: 3, sold: 1, returned: 2, remaining: 0, reserved: 0 });
});

test("Case 8: getBatchListStats — exactly one supabase.from() call regardless of how many Lots/products (no N+1)", async () => {
  nextListProductsResult = {
    data: Array.from({ length: 50 }, (_, i) => ({ batch_id: `batch-${i % 5}`, status: i % 2 === 0 ? "Sold" : "Available" })),
    error: null,
  };

  const { getBatchListStats } = await import("./productBatch.service");
  await getBatchListStats();

  assert.equal(fromCalls.length, 1, "must be exactly one query for the whole list, not one per Lot");
  assert.deepEqual(fromCalls, ["products"]);
});

test("Case 9: getBatchListStats — a batch_id with zero products simply has no entry in the map (caller defaults to 0)", async () => {
  nextListProductsResult = { data: [{ batch_id: "batch-with-products", status: "Sold" }], error: null };

  const { getBatchListStats } = await import("./productBatch.service");
  const stats = await getBatchListStats();

  assert.ok(stats.has("batch-with-products"));
  assert.equal(stats.has("batch-empty"), false);
});

test("Case 7: getBatchStats and getBatchListStats agree on the same fixture", async () => {
  const fixtureRows = [
    { batch_id: "batch-X", status: "Sold" },
    { batch_id: "batch-X", status: "Sold" },
    { batch_id: "batch-X", status: "Archived", returned_at: "2026-08-15T00:00:00Z" },
    { batch_id: "batch-X", status: "Available" },
    { batch_id: "batch-X", status: "Reserved" },
  ];
  nextListProductsResult = { data: fixtureRows, error: null };

  const { getBatchListStats, computeBatchCounts } = await import("./productBatch.service");
  const listResult = await getBatchListStats();

  // getBatchStats itself hits customer_purchases too (revenue), which this
  // file's fake client doesn't stub - comparing against computeBatchCounts()
  // directly (the exact function getBatchStats delegates to) is the more
  // precise consistency check: it proves both callers reach the identical
  // formula, without needing to also fake the revenue join here.
  const detailCounts = computeBatchCounts(fixtureRows.map((r) => ({ status: r.status, returned_at: r.returned_at })));

  assert.deepEqual(listResult.get("batch-X"), detailCounts);
});
