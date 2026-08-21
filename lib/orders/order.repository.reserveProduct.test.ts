import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Product-Level Status, D1-D10 Test Plan — Case 4: a Returned Product
 * must never become Sold unless a business flow explicitly allows it. The
 * only path to Sold through the Orders module is Active -> Reserved ->
 * Sold, gated by reserveProduct()'s `WHERE status = 'Active'` guard
 * (lib/orders/order.repository.ts) - a Returned product can never pass
 * this gate, so it can never reach Reserved, so it can never reach Sold.
 * This test pins that guard, not the Reserved->Sold step itself (already
 * covered by order.repository.completeOrder.test.ts).
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as order.repository.completeOrder.test.ts.
 */
let matchingRows: { id: string }[] = [{ id: "product-1" }];
const updateCalls: { status: string; guardStatus: string }[] = [];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table !== "products") throw new Error(`Unexpected table in test: ${table}`);
        return {
          update: (payload: { status: string }) => ({
            eq: (_col1: string, _id: string) => ({
              eq: (_col2: string, guardStatus: string) => ({
                select: () => {
                  updateCalls.push({ status: payload.status, guardStatus });
                  return Promise.resolve({ data: matchingRows, error: null });
                },
              }),
            }),
          }),
        };
      },
    },
  },
});

test.beforeEach(() => {
  updateCalls.length = 0;
  matchingRows = [{ id: "product-1" }];
});

test("Case 4: an Available product can be reserved (guard matches, BR-003)", async () => {
  matchingRows = [{ id: "product-1" }];

  const { reserveProduct } = await import("./order.repository");
  await assert.doesNotReject(() => reserveProduct("product-1"));

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].guardStatus, "Available", "must guard on WHERE status = 'Available'");
});

test("Case 4: an Archived (formerly Returned) product cannot be reserved (0 rows matched -> rejected, never reaches Sold)", async () => {
  matchingRows = []; // status='Archived' never satisfies the WHERE status='Available' guard

  const { reserveProduct } = await import("./order.repository");
  await assert.rejects(() => reserveProduct("product-1"));
});
