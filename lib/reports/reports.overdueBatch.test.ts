import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// reports.service.ts's own module-level `import { supabase } from "@/lib/supabase"`
// creates a real Supabase client at module-eval time and throws without
// project env vars configured - same reasoning/fix as
// lib/orders/order.service.test.ts. Every test here passes its own fake
// client explicitly, so this only needs to exist, never be called.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

/**
 * Business Time Migration, Wave 2 - regression coverage for
 * getBatchStaticReportData()'s Overdue Batch determination, the one Reports
 * function in scope that computes its own "today" (Reports otherwise only
 * consumes a `range` computed by lib/dateFilter.ts, already covered by
 * lib/dateFilter.test.ts).
 */

function createFakeSupabase(batches: { id: string; batch_code: string; status: string; return_due_date: string | null }[]) {
  return {
    from(table: string) {
      if (table === "product_batches") {
        return { select: () => Promise.resolve({ data: batches, error: null }) };
      }
      // products query - no products needed for this test, just satisfy the shape.
      return {
        select: () => ({
          not: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
  };
}

test('Overdue Batch: a batch due "2026-07-24" is overdue at 00:01 Vietnam (2026-07-24T17:01:00Z UTC), even though UTC itself is still 2026-07-24', async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-07-24T17:01:00.000Z") });
  const { getBatchStaticReportData } = await import("./reports.service");

  const fakeClient = createFakeSupabase([
    { id: "batch-1", batch_code: "B001", status: "active", return_due_date: "2026-07-24" },
  ]);

  const result = await getBatchStaticReportData(fakeClient as never);
  t.mock.timers.reset();

  assert.equal(result.overdueBatches.length, 1);
  assert.equal(result.overdueBatches[0].batchId, "batch-1");
  assert.equal(result.overdueBatches[0].daysOverdue, 1);
});

test('Overdue Batch: a batch due "2026-07-25" is NOT yet overdue at the same instant (due today, not the past)', async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-07-24T17:01:00.000Z") }); // Vietnam 2026-07-25
  const { getBatchStaticReportData } = await import("./reports.service");

  const fakeClient = createFakeSupabase([
    { id: "batch-2", batch_code: "B002", status: "active", return_due_date: "2026-07-25" },
  ]);

  const result = await getBatchStaticReportData(fakeClient as never);
  t.mock.timers.reset();

  assert.equal(result.overdueBatches.length, 0);
});
