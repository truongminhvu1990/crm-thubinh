import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Product-Level Status, D1-D10 Test Plan — Case 5: a Product with
 * historical business data must never be hard-deleted (Decision 4, LOCKED).
 * Covers all 4 categories the Product Owner authorization named:
 * customer purchase / order relationship / sale history (same check),
 * compensation history, and Lot history (batch_id set, or status
 * Sold/Returned).
 *
 * mock.module() called once at file scope, mutable state per test — same
 * reasoning as lib/orders/order.repository.completeOrder.test.ts.
 */
interface FakeState {
  customerPurchases: unknown[];
  orderItems: unknown[];
  compensations: unknown[];
  product: { batch_id: string | null; status: string | null } | null;
}

const deleteCalls: string[] = [];
let state: FakeState = {
  customerPurchases: [],
  orderItems: [],
  compensations: [],
  product: { batch_id: null, status: "Active" },
};

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table === "customer_purchases") {
          return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: state.customerPurchases, error: null }) }) }) };
        }
        if (table === "order_items") {
          return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: state.orderItems, error: null }) }) }) };
        }
        if (table === "compensations") {
          return { select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: state.compensations, error: null }) }) }) };
        }
        if (table === "products") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.product, error: null }) }) }),
            delete: () => ({
              eq: (_col: string, id: string) => {
                deleteCalls.push(id);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  },
});

mock.module("@/lib/auditLog.service", { namedExports: { logStatusChange: async () => {} } });

const NO_HISTORY: FakeState = {
  customerPurchases: [],
  orderItems: [],
  compensations: [],
  product: { batch_id: null, status: "Active" },
};

test.beforeEach(() => {
  deleteCalls.length = 0;
  state = { ...NO_HISTORY };
});

test("Case 5a: Product with customer_purchases history is blocked", async () => {
  state = { ...NO_HISTORY, customerPurchases: [{ id: "p1" }] };
  const { deleteProduct } = await import("./product.service");

  const result = await deleteProduct("product-1");
  assert.ok(result && typeof result === "object" && "code" in result && result.code === "PRODUCT_HAS_HISTORY");
  assert.equal(deleteCalls.length, 0, "must never reach the actual DELETE");
});

test("Case 5b: Product with an order_items relationship is blocked", async () => {
  state = { ...NO_HISTORY, orderItems: [{ id: "oi1" }] };
  const { deleteProduct } = await import("./product.service");

  const result = await deleteProduct("product-1");
  assert.ok(result && typeof result === "object" && "code" in result && result.code === "PRODUCT_HAS_HISTORY");
  assert.equal(deleteCalls.length, 0);
});

test("Case 5c: Product with compensation history is blocked", async () => {
  state = { ...NO_HISTORY, compensations: [{ id: "c1" }] };
  const { deleteProduct } = await import("./product.service");

  const result = await deleteProduct("product-1");
  assert.ok(result && typeof result === "object" && "code" in result && result.code === "PRODUCT_HAS_HISTORY");
  assert.equal(deleteCalls.length, 0);
});

test("Case 5d: Product currently in a Lot (batch_id set) is blocked", async () => {
  state = { ...NO_HISTORY, product: { batch_id: "batch-1", status: "Active" } };
  const { deleteProduct } = await import("./product.service");

  const result = await deleteProduct("product-1");
  assert.ok(result && typeof result === "object" && "code" in result && result.code === "PRODUCT_HAS_HISTORY");
  assert.equal(deleteCalls.length, 0);
});

test("Case 5e: Product Returned (never sold, batch_id null) is still blocked - Lot history", async () => {
  state = { ...NO_HISTORY, product: { batch_id: null, status: "Returned" } };
  const { deleteProduct } = await import("./product.service");

  const result = await deleteProduct("product-1");
  assert.ok(result && typeof result === "object" && "code" in result && result.code === "PRODUCT_HAS_HISTORY");
  assert.equal(deleteCalls.length, 0);
});

test("Case 5f: Product with zero historical relationships is allowed to delete", async () => {
  state = { ...NO_HISTORY };
  const { deleteProduct } = await import("./product.service");

  const error = await deleteProduct("product-1");
  assert.equal(error, null);
  assert.deepEqual(deleteCalls, ["product-1"]);
});
