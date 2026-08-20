import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Inventory Traceability (Product Owner Authorization, 2026-08-20) - Test
 * Plan cases 2-5: getPurchaseForProduct() must return the historical Order
 * (via order_item_id -> order_items -> orders) in one query, pass a
 * Cancelled order's status through unfiltered (the UI decides how to badge
 * it - the service must not hide it), and stay null-safe for legacy/
 * manually-entered purchases and products never sold.
 *
 * mock.module() called once at file scope, mutable state per test - same
 * documented reasoning as lib/orders/order.repository.reserveProduct.test.ts.
 * Only "@/lib/supabase" is mocked (matching that same precedent) -
 * supabase.auth.getUser() resolves to no user, so getCurrentStaff() short-
 * circuits to null and the Purchase History Visibility scoping branch never
 * runs, keeping this test focused on the query shape and result mapping.
 */
interface FakeRow {
  id: string;
  customer_id: string;
  product_id: string;
  sale_price: number;
  sale_date: string;
  salesperson: string | null;
  order_item_id: string | null;
  customer: { id: string; full_name: string; customer_code: string } | null;
  order_item: { order: { id: string; order_number: string; order_status: string } | null } | null;
}

let row: FakeRow | null = null;
let lastSelectArg: string | null = null;

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: null } }),
      },
      from(table: string) {
        if (table !== "customer_purchases") throw new Error(`Unexpected table in test: ${table}`);
        return {
          select: (arg: string) => {
            lastSelectArg = arg;
            return {
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: row, error: null }),
                  }),
                }),
              }),
            };
          },
        };
      },
    },
  },
});

test.beforeEach(() => {
  row = null;
  lastSelectArg = null;
});

test("getPurchaseForProduct: selects the Order embed in a single query (no N+1)", async () => {
  const { getPurchaseForProduct } = await import("./purchase.service");
  await getPurchaseForProduct("product-1");

  assert.ok(lastSelectArg, "select() must have been called");
  assert.match(lastSelectArg!, /order_item:order_items\(order:orders\(/);
});

test("Order-linked purchase: returns the historical Order (id, number, status)", async () => {
  row = {
    id: "purchase-1",
    customer_id: "customer-1",
    product_id: "product-1",
    sale_price: 1000000,
    sale_date: "2026-08-01",
    salesperson: "Nguyễn Văn A",
    order_item_id: "item-1",
    customer: { id: "customer-1", full_name: "Trần Thị B", customer_code: "KH001" },
    order_item: { order: { id: "order-1", order_number: "OD-20260801-000001", order_status: "Completed" } },
  };

  const { getPurchaseForProduct } = await import("./purchase.service");
  const result = await getPurchaseForProduct("product-1");

  assert.equal(result?.order_item?.order?.order_number, "OD-20260801-000001");
  assert.equal(result?.order_item?.order?.order_status, "Completed");
});

test("Cancelled order: status passed through unfiltered, not hidden by the service", async () => {
  row = {
    id: "purchase-2",
    customer_id: "customer-1",
    product_id: "product-2",
    sale_price: 2000000,
    sale_date: "2026-08-05",
    salesperson: null,
    order_item_id: "item-2",
    customer: { id: "customer-1", full_name: "Trần Thị B", customer_code: "KH001" },
    order_item: { order: { id: "order-2", order_number: "OD-20260805-000002", order_status: "Cancelled" } },
  };

  const { getPurchaseForProduct } = await import("./purchase.service");
  const result = await getPurchaseForProduct("product-2");

  assert.equal(result?.order_item?.order?.order_status, "Cancelled");
  assert.equal(result?.order_item?.order?.order_number, "OD-20260805-000002");
});

test("Legacy purchase (no order_item_id): order_item is null, not a fake Order", async () => {
  row = {
    id: "purchase-3",
    customer_id: "customer-1",
    product_id: "product-3",
    sale_price: 500000,
    sale_date: "2026-07-20",
    salesperson: "Lê Văn C",
    order_item_id: null,
    customer: { id: "customer-1", full_name: "Trần Thị B", customer_code: "KH001" },
    order_item: null,
  };

  const { getPurchaseForProduct } = await import("./purchase.service");
  const result = await getPurchaseForProduct("product-3");

  assert.equal(result?.order_item, null);
  assert.equal(result?.salesperson, "Lê Văn C");
});

test("Unsold / no purchase row: returns null gracefully", async () => {
  row = null;

  const { getPurchaseForProduct } = await import("./purchase.service");
  const result = await getPurchaseForProduct("product-4");

  assert.equal(result, null);
});
