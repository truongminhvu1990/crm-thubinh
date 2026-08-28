import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Order Revenue Visibility Semantic Gap fix (2026-08-29 follow-up).
 * Proves the two required reconciliation identities directly, combining
 * getOrderValueSummary() (lib/orders/orderValueSummary.service.ts, Orders
 * population) and getPurchaseReportData() (lib/reports/reports.service.ts,
 * Reporting population, unchanged) against one shared fake dataset:
 *
 *   Order population:
 *     Total Order Value = Order-based Recognized Value + Order-based Unrecognized Value
 *
 *   Reporting population:
 *     Recognized Revenue = Order-based Recognized Revenue + Legacy BR-002 Revenue
 *
 * and demonstrates that when legacy revenue exists, the OLD (fixed) formula
 * — Unrecognized = Total Order Value − Recognized Revenue — would have been
 * wrong, while the new Orders-only B3 is correct.
 */
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeByName: async () => {
      throw new Error("applyDataScopeByName must not be called when staff is omitted");
    },
  },
});

interface FakeOrderRow {
  order_status: string;
  payment_status: string;
  total_amount: number;
}

interface FakePurchaseRow {
  customer_id: string;
  product_id: string | null;
  sale_price: number;
  sale_date: string;
  source: string | null;
  salesperson: string | null;
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
  customer: { full_name: string } | null;
}

/** Routes by table name to two independent fakes — orders (order-based
 * query builder, chainable) and customer_purchases (a single `.select()`
 * call, matching getPurchaseReportData's exact shape when called with
 * `range: null, staff: null`, product_id null on every row skipping the
 * second `products` query). */
function combinedFakeClient(orderRows: FakeOrderRow[], purchaseRows: FakePurchaseRow[]) {
  return {
    from: (table: string) => {
      if (table === "orders") {
        const builder = {
          select: () => builder,
          neq: () => builder,
          gte: () => builder,
          lt: () => builder,
          then: (resolve: (r: { data: FakeOrderRow[]; error: null }) => void) => resolve({ data: orderRows, error: null }),
        };
        return builder;
      }
      if (table === "customer_purchases") {
        return { select: async () => ({ data: purchaseRows, error: null }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as never;
}

function order(order_status: string, payment_status: string, total_amount: number): FakeOrderRow {
  return { order_status, payment_status, total_amount };
}

function linkedPurchase(sale_price: number, orderMeta: { order_status: string; payment_status: string }): FakePurchaseRow {
  return {
    customer_id: "cust-1",
    product_id: null,
    sale_price,
    sale_date: "2026-08-15",
    source: null,
    salesperson: null,
    order_item_id: "item-1",
    order_items: { orders: orderMeta },
    customer: null,
  };
}

function legacyPurchase(sale_price: number): FakePurchaseRow {
  return {
    customer_id: "cust-2",
    product_id: null,
    sale_price,
    sale_date: "2026-08-15",
    source: null,
    salesperson: null,
    order_item_id: null,
    order_items: null,
    customer: null,
  };
}

test("Order population identity holds with no legacy revenue: Total Order Value = Order-based Recognized Value + Order-based Unrecognized Value", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const client = combinedFakeClient(
    [order("Completed", "Paid", 1_000_000), order("Draft", "Unpaid", 500_000)],
    []
  );

  const orderValue = await getOrderValueSummary(null, undefined, client);

  assert.equal(orderValue.totalOrderValue, 1_500_000);
  assert.equal(orderValue.orderBasedRecognizedValue + orderValue.orderBasedUnrecognizedValue, orderValue.totalOrderValue);
});

test("Legacy BR-002 revenue exists: B2 includes it, B3 does not subtract it, and the old (fixed) B1-B2 formula would have been wrong", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const { getPurchaseReportData } = await import("../reports/reports.service");

  // Order A: Completed + Paid, ₫1,000,000 — has a matching linked
  // customer_purchases row (written at completion, per
  // complete_order_with_snapshots()).
  // Order B: Draft + Paid, ₫500,000 — never completed, so it has NO
  // customer_purchases row at all (consistent with the real DB trigger).
  // Legacy row: ₫300,000, no order link (BR-002).
  const orderRows = [order("Completed", "Paid", 1_000_000), order("Draft", "Paid", 500_000)];
  const purchaseRows = [linkedPurchase(1_000_000, { order_status: "Completed", payment_status: "Paid" }), legacyPurchase(300_000)];
  const client = combinedFakeClient(orderRows, purchaseRows);

  const orderValue = await getOrderValueSummary(null, undefined, client);
  const purchases = await getPurchaseReportData(null, client, null);

  // Order population.
  assert.equal(orderValue.totalOrderValue, 1_500_000);
  assert.equal(orderValue.orderBasedRecognizedValue, 1_000_000);
  assert.equal(orderValue.orderBasedUnrecognizedValue, 500_000, "B3 — the Draft+Paid order's own value, untouched by legacy revenue");

  // Reporting population: Recognized Revenue = Order-based Recognized Revenue + Legacy BR-002 Revenue.
  const legacyRevenue = 300_000;
  assert.equal(purchases.totalRevenue, 1_300_000);
  assert.equal(orderValue.orderBasedRecognizedValue + legacyRevenue, purchases.totalRevenue);

  // The semantic gap this task fixes: the OLD formula (Total Order Value −
  // Recognized Revenue) would have understated B3 by exactly the legacy
  // amount, because Recognized Revenue included ₫300,000 with no Order at
  // all to net it against.
  const oldWrongFormula = orderValue.totalOrderValue - purchases.totalRevenue;
  assert.equal(oldWrongFormula, 200_000);
  assert.notEqual(oldWrongFormula, orderValue.orderBasedUnrecognizedValue, "B3 != B1 - B2 when legacy revenue exists — this is expected, not a bug");
  assert.equal(orderValue.orderBasedUnrecognizedValue, 500_000, "the correct B3 stays the true value of the one unrecognized Order");
});
