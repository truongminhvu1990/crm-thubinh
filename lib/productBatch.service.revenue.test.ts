import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Revenue Filtering (Product Owner Authorization, 2026-08-20) —
 * getBatchStats()'s revenue must exclude Cancelled orders (BR-001), while
 * counts (total/sold/returned/remaining/reserved) stay unaffected.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as lib/orders/order.repository.completeOrder.test.ts.
 */
interface FakePurchaseRow {
  sale_price: number;
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
  product: { batch_id: string };
}

let purchaseFixture: FakePurchaseRow[] = [];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table === "products") {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        if (table === "customer_purchases") {
          return {
            select: () => ({
              eq: (_col: string, batchId: string) =>
                Promise.resolve({ data: purchaseFixture.filter((r) => r.product.batch_id === batchId), error: null }),
            }),
          };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  },
});

test.beforeEach(() => {
  purchaseFixture = [];
});

function row(overrides: {
  sale_price?: number;
  order_item_id?: string | null;
  batchId?: string;
  orderStatus?: string | null;
  paymentStatus?: string;
}): FakePurchaseRow {
  const orderItemId = "order_item_id" in overrides ? overrides.order_item_id! : "item-1";
  return {
    sale_price: overrides.sale_price ?? 1000000,
    order_item_id: orderItemId,
    order_items:
      overrides.orderStatus === null
        ? null
        : { orders: { order_status: overrides.orderStatus ?? "Completed", payment_status: overrides.paymentStatus ?? "Paid" } },
    product: { batch_id: overrides.batchId ?? "HX1" },
  };
}

test("Case 1: Completed + Paid is included", async () => {
  purchaseFixture = [row({ orderStatus: "Completed", paymentStatus: "Paid", sale_price: 10000000 })];
  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("HX1");
  assert.equal(stats.revenue, 10000000);
});

test("Case 2: Cancelled is excluded", async () => {
  purchaseFixture = [row({ orderStatus: "Cancelled", paymentStatus: "Paid", sale_price: 15000000 })];
  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("HX1");
  assert.equal(stats.revenue, 0);
});

test("Completed + Unpaid is excluded (pre-existing BR-001, unrelated to Cancellation)", async () => {
  purchaseFixture = [row({ orderStatus: "Completed", paymentStatus: "Unpaid", sale_price: 5000000 })];
  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("HX1");
  assert.equal(stats.revenue, 0);
});

test("Case 3: Completed -> Cancelled makes the same row's revenue disappear", async () => {
  const { getBatchStats } = await import("./productBatch.service");

  purchaseFixture = [row({ orderStatus: "Completed", paymentStatus: "Paid", sale_price: 8000000 })];
  const before = await getBatchStats("HX1");
  assert.equal(before.revenue, 8000000);

  purchaseFixture = [row({ orderStatus: "Cancelled", paymentStatus: "Paid", sale_price: 8000000 })];
  const after = await getBatchStats("HX1");
  assert.equal(after.revenue, 0);
});

test("Case 4 + Case 5: disposition (Remaining vs Returned) is never a factor - only Order.status is read here", async () => {
  // The function has no disposition input at all - this test documents
  // that fact by construction: a Cancelled row is excluded regardless of
  // what lib/product.service.ts's returnProductToSupplier/Remaining path
  // did to the Product afterward, because getBatchStats never queries
  // products.status/returned_at for its revenue calculation.
  purchaseFixture = [row({ orderStatus: "Cancelled", paymentStatus: "Paid", sale_price: 10000000 })];
  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("HX1");
  assert.equal(stats.revenue, 0, "Cancelled excludes revenue regardless of the Product's resulting disposition");
});

test("Case 6: multi-product Order across multiple Lots - each Lot gets only its own row", async () => {
  purchaseFixture = [
    row({ batchId: "HX1", order_item_id: "item-A", orderStatus: "Completed", paymentStatus: "Paid", sale_price: 10000000 }),
    row({ batchId: "HX2", order_item_id: "item-B", orderStatus: "Completed", paymentStatus: "Paid", sale_price: 15000000 }),
  ];
  const { getBatchStats } = await import("./productBatch.service");
  const hx1 = await getBatchStats("HX1");
  const hx2 = await getBatchStats("HX2");
  assert.equal(hx1.revenue, 10000000);
  assert.equal(hx2.revenue, 15000000);
});

test("Case 6 (cancelled): same multi-Lot Order, now Cancelled - both Lots drop to 0, never each other's amount", async () => {
  purchaseFixture = [
    row({ batchId: "HX1", order_item_id: "item-A", orderStatus: "Cancelled", paymentStatus: "Paid", sale_price: 10000000 }),
    row({ batchId: "HX2", order_item_id: "item-B", orderStatus: "Cancelled", paymentStatus: "Paid", sale_price: 15000000 }),
  ];
  const { getBatchStats } = await import("./productBatch.service");
  const hx1 = await getBatchStats("HX1");
  const hx2 = await getBatchStats("HX2");
  assert.equal(hx1.revenue, 0);
  assert.equal(hx2.revenue, 0);
});

test("Case 7: a Lot with mixed Completed + Cancelled purchases - only Completed counted", async () => {
  purchaseFixture = [
    row({ batchId: "HX1", order_item_id: "item-1", orderStatus: "Completed", paymentStatus: "Paid", sale_price: 10000000 }),
    row({ batchId: "HX1", order_item_id: "item-2", orderStatus: "Cancelled", paymentStatus: "Paid", sale_price: 15000000 }),
    row({ batchId: "HX1", order_item_id: "item-3", orderStatus: "Completed", paymentStatus: "Paid", sale_price: 3000000 }),
  ];
  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("HX1");
  assert.equal(stats.revenue, 13000000, "10M + 3M, the 15M Cancelled row excluded - matches the exact PO example scenario");
});

test("Case 8: no recognized purchases -> revenue = 0", async () => {
  purchaseFixture = [];
  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("HX1");
  assert.equal(stats.revenue, 0);
});

test("legacy row with no order_item_id (predates Orders module) still counts as recognized, unchanged behavior", async () => {
  purchaseFixture = [row({ order_item_id: null, orderStatus: null, sale_price: 2000000 })];
  const { getBatchStats } = await import("./productBatch.service");
  const stats = await getBatchStats("HX1");
  assert.equal(stats.revenue, 2000000);
});
