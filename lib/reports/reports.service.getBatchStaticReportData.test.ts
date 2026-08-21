import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * BR-003 Final Blocker Fix (Product Owner Authorization, 2026-08-21) —
 * Blocker 2: getBatchStaticReportData()'s Remaining/Returned split must
 * derive "returned to supplier" from returned_at IS NOT NULL, never from
 * the retired status === "Returned" literal, and must stay consistent
 * with computeBatchCounts()'s own invariant (productBatch.service.ts):
 * an Archived product with returned_at NULL is NOT excluded from
 * Remaining - only an actual returned_at marks a product as Returned.
 *
 * reports.service.ts imports "@/lib/supabase" at module scope, which
 * creates a real Supabase client and throws without project env vars -
 * mocked once, at file scope, per this repo's established convention
 * (e.g. order.service.test.ts). getBatchStaticReportData() also accepts
 * an injectable `client` parameter (existing DI pattern already used
 * throughout this codebase) - a plain fake object is passed directly for
 * the actual query behavior under test.
 */
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakeProductRow {
  batch_id: string;
  status: string | null;
  returned_at: string | null;
}

function makeFakeClient(products: FakeProductRow[], batchId = "batch-1", batchCode = "HX1") {
  return {
    from(table: string) {
      if (table === "product_batches") {
        return {
          select: () =>
            Promise.resolve({
              data: [{ id: batchId, batch_code: batchCode, status: "active", return_due_date: null }],
              error: null,
            }),
        };
      }
      if (table === "products") {
        return {
          select: () => ({
            not: () => Promise.resolve({ data: products, error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("BR-003 Blocker 2: an Available product counts as Remaining", async () => {
  const { getBatchStaticReportData } = await import("./reports.service");
  const client = makeFakeClient([{ batch_id: "batch-1", status: "Available", returned_at: null }]);
  const result = await getBatchStaticReportData(client);
  assert.deepEqual(result.remainingCountByBatch, [{ batchId: "batch-1", batchCode: "HX1", count: 1 }]);
  assert.deepEqual(result.soldCountByBatch, []);
});

test("BR-003 Blocker 2: a Reserved product counts as Remaining AND as its own reserved sub-count (D6, LOCKED, unchanged)", async () => {
  const { getBatchStaticReportData } = await import("./reports.service");
  const client = makeFakeClient([{ batch_id: "batch-1", status: "Reserved", returned_at: null }]);
  const result = await getBatchStaticReportData(client);
  assert.deepEqual(result.remainingCountByBatch, [{ batchId: "batch-1", batchCode: "HX1", count: 1 }]);
  assert.deepEqual(result.reservedCountByBatch, [{ batchId: "batch-1", batchCode: "HX1", count: 1 }]);
});

test("BR-003 Blocker 2: a Sold product does NOT count as Remaining", async () => {
  const { getBatchStaticReportData } = await import("./reports.service");
  const client = makeFakeClient([{ batch_id: "batch-1", status: "Sold", returned_at: null }]);
  const result = await getBatchStaticReportData(client);
  assert.deepEqual(result.soldCountByBatch, [{ batchId: "batch-1", batchCode: "HX1", count: 1 }]);
  assert.deepEqual(result.remainingCountByBatch, []);
});

test("BR-003 Blocker 2: Archived + returned_at set does NOT count as Remaining (this is the confirmed bug fix)", async () => {
  const { getBatchStaticReportData } = await import("./reports.service");
  const client = makeFakeClient([
    { batch_id: "batch-1", status: "Archived", returned_at: "2026-08-15T00:00:00Z" },
  ]);
  const result = await getBatchStaticReportData(client);
  assert.deepEqual(result.remainingCountByBatch, [], "an Archived, actually-returned product must be excluded from Remaining");
  assert.deepEqual(result.soldCountByBatch, []);
});

test("BR-003 Blocker 2: Archived + returned_at NULL still counts as Remaining (must NOT be misclassified as Returned)", async () => {
  const { getBatchStaticReportData } = await import("./reports.service");
  const client = makeFakeClient([{ batch_id: "batch-1", status: "Archived", returned_at: null }]);
  const result = await getBatchStaticReportData(client);
  assert.deepEqual(
    result.remainingCountByBatch,
    [{ batchId: "batch-1", batchCode: "HX1", count: 1 }],
    "an Archived product with no returned_at is not Returned - it stays Remaining, matching computeBatchCounts()"
  );
});

test("BR-003 Blocker 2: consistency with computeBatchCounts() — mixed batch matches the same invariant (total = sold + returned + remaining)", async () => {
  const { getBatchStaticReportData } = await import("./reports.service");
  const client = makeFakeClient([
    { batch_id: "batch-1", status: "Sold", returned_at: null },
    { batch_id: "batch-1", status: "Archived", returned_at: "2026-08-15T00:00:00Z" },
    { batch_id: "batch-1", status: "Available", returned_at: null },
    { batch_id: "batch-1", status: "Reserved", returned_at: null },
  ]);
  const result = await getBatchStaticReportData(client);
  // total=4, sold=1, returned(excluded)=1, remaining=2 (Available + Reserved)
  assert.equal(result.soldCountByBatch[0].count, 1);
  assert.equal(result.remainingCountByBatch[0].count, 2);
  assert.equal(result.reservedCountByBatch[0].count, 1);
});
