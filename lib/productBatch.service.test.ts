import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Product-Level Status, D1-D10 Test Plan — Case 1 & Case 7.
 *
 * mock.module() is called exactly once, at file scope (matching
 * lib/orders/order.repository.completeOrder.test.ts's documented
 * convention) - a module already imported earlier in this process has its
 * `import { supabase } from "./supabase"` binding resolved once, so a
 * second mock.module() call cannot be relied on to change what an
 * already-cached importer sees. `nextProductsResult` is mutated per-test
 * instead.
 *
 * Case 1: a batch with 3 Sold, 4 Returned, 2 plain-Remaining (Active), 1
 * Reserved (10 products total) must report Total=10, Sold=3, Returned=4,
 * Remaining=3 (Decision 6, LOCKED: Remaining = Total - Sold - Returned,
 * Reserved included inside it, never added on top).
 *
 * Case 7: Reserved must be counted inside Remaining, exposed as its own
 * `reserved` sub-count (not a sibling total) for the "Đang giữ đơn" filter.
 */
let nextProductsResult: { data: { status: string }[] | null; error: unknown } = { data: [], error: null };

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table === "products") {
          return { select: () => ({ eq: () => Promise.resolve(nextProductsResult) }) };
        }
        if (table === "customer_purchases") {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  },
});

test.beforeEach(() => {
  nextProductsResult = { data: [], error: null };
});

test("Case 1 + Case 7: getBatchStats - 3 Sold, 4 Returned, 2 Remaining, 1 Reserved", async () => {
  nextProductsResult = {
    data: [
      { status: "Sold" },
      { status: "Sold" },
      { status: "Sold" },
      { status: "Returned" },
      { status: "Returned" },
      { status: "Returned" },
      { status: "Returned" },
      { status: "Active" },
      { status: "Active" },
      { status: "Reserved" },
    ],
    error: null,
  };

  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("batch-1");

  assert.equal(stats.total, 10);
  assert.equal(stats.sold, 3);
  assert.equal(stats.returned, 4);
  assert.equal(stats.remaining, 3, "Remaining = Total - Sold - Returned = 10 - 3 - 4 = 3 (includes Reserved)");
  assert.equal(stats.reserved, 1, "reserved is a sub-count, already included in remaining above");
});

test("Case 1 edge: empty batch reports all zeros, never throws", async () => {
  nextProductsResult = { data: [], error: null };

  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("empty-batch");

  assert.deepEqual(stats, { total: 0, sold: 0, returned: 0, remaining: 0, reserved: 0, revenue: 0 });
});
