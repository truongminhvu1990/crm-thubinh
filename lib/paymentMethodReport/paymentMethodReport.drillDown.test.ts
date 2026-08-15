import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// Same module-load reasons as paymentMethodReport.service.test.ts: this
// repository transitively imports "@/lib/supabase" (throws without env
// vars) via "@/lib/permission"/"@/lib/permission/dataScope". Every test
// below passes `staff: null` explicitly, so the actual Data Scope call is
// never made — these mocks exist only so the module graph can load.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", { namedExports: { applyDataScopeByName: async (q: unknown) => ({ query: q }) } });

interface FakePayment {
  order_id: string;
  amount: number;
  payment_method: string;
}

interface FakeOrderItem {
  order_id: string;
  product_id: string;
  line_total: number;
  products: { product_code: string; product_name: string };
  orders: { order_number: string; order_date: string; total_amount: number; customer_id: string; customers: { full_name: string; customer_code: string } };
}

function makeFakeClient(allPayments: FakePayment[], orderItems: FakeOrderItem[]) {
  return {
    from(table: string) {
      if (table === "payments") {
        return {
          select: () => {
            let filtered = allPayments;
            const obj: Record<string, unknown> = {
              eq: (_col: string, val: string) => {
                filtered = allPayments.filter((p) => p.payment_method === val);
                return obj;
              },
              gte: () => obj,
              lt: () => obj,
              in: (_col: string, ids: string[]) =>
                Promise.resolve({ data: allPayments.filter((p) => ids.includes(p.order_id)), error: null }),
              then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: filtered, error: null }).then(resolve),
            };
            return obj;
          },
        };
      }
      if (table === "order_items") {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({ data: orderItems.filter((i) => ids.includes(i.order_id)), error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table in test fake: ${table}`);
    },
  };
}

let findOrderItemsForPaymentMethodDrillDown: typeof import("./paymentMethodReport.repository").findOrderItemsForPaymentMethodDrillDown;

before(async () => {
  ({ findOrderItemsForPaymentMethodDrillDown } = await import("./paymentMethodReport.repository"));
});

function customerOrder(overrides: Partial<FakeOrderItem["orders"]> = {}) {
  return {
    order_number: "000001",
    order_date: "2026-08-01",
    total_amount: 9_500_000,
    customer_id: "c1",
    customers: { full_name: "Khách A", customer_code: "KH01" },
    ...overrides,
  };
}

test("drill-down: single Order, single Order Item — full Order/Product/Customer identification, sale amount = line_total", async () => {
  const client = makeFakeClient(
    [{ order_id: "o1", amount: 9_500_000, payment_method: "Tiền mặt" }],
    [{ order_id: "o1", product_id: "prod1", line_total: 9_500_000, products: { product_code: "SP01", product_name: "Vòng ngọc" }, orders: customerOrder() }]
  );

  const rows = await findOrderItemsForPaymentMethodDrillDown({}, "Tiền mặt", client as never, null);

  assert.equal(rows.length, 1);
  assert.deepEqual(
    { orderNumber: rows[0].orderNumber, productCode: rows[0].productCode, productName: rows[0].productName, customerName: rows[0].customerName, customerCode: rows[0].customerCode },
    { orderNumber: "000001", productCode: "SP01", productName: "Vòng ngọc", customerName: "Khách A", customerCode: "KH01" }
  );
  assert.equal(rows[0].saleAmount, 9_500_000);
  assert.equal(rows[0].amountPaid, 9_500_000);
  assert.equal(rows[0].remainingBalance, 0);
  assert.equal(rows[0].paymentMethods, "Tiền mặt");
});

test("drill-down: multi-product Order is never collapsed — one row per Order Item", async () => {
  const client = makeFakeClient(
    [{ order_id: "o1", amount: 15_000_000, payment_method: "Tiền mặt" }],
    [
      { order_id: "o1", product_id: "prod1", line_total: 10_000_000, products: { product_code: "SP01", product_name: "Vòng ngọc" }, orders: customerOrder({ total_amount: 15_000_000 }) },
      { order_id: "o1", product_id: "prod2", line_total: 5_000_000, products: { product_code: "SP02", product_name: "Nhẫn ngọc" }, orders: customerOrder({ total_amount: 15_000_000 }) },
    ]
  );

  const rows = await findOrderItemsForPaymentMethodDrillDown({}, "Tiền mặt", client as never, null);

  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((r) => r.productCode)), new Set(["SP01", "SP02"]));
  // Both items share the same Order-level paid/remaining (Order-level fields, per Product Owner's own definition).
  assert.equal(rows[0].amountPaid, 15_000_000);
  assert.equal(rows[1].amountPaid, 15_000_000);
});

test("drill-down: split-payment Order — drilling into one method still shows every method actually recorded on the Order, not just the selected one", async () => {
  const client = makeFakeClient(
    [
      { order_id: "o1", amount: 5_000_000, payment_method: "Tiền mặt" },
      { order_id: "o1", amount: 4_500_000, payment_method: "Chuyển khoản" },
    ],
    [{ order_id: "o1", product_id: "prod1", line_total: 9_500_000, products: { product_code: "SP01", product_name: "Vòng ngọc" }, orders: customerOrder() }]
  );

  const rows = await findOrderItemsForPaymentMethodDrillDown({}, "Tiền mặt", client as never, null);

  assert.equal(rows.length, 1); // the Order has a Tiền mặt payment, so it belongs in this drill-down
  assert.equal(rows[0].paymentMethods, "Chuyển khoản, Tiền mặt"); // but reports BOTH methods, accurately
  assert.equal(rows[0].amountPaid, 9_500_000);
});

test("drill-down: no Orders match the selected method — empty result, not an error", async () => {
  const client = makeFakeClient([{ order_id: "o1", amount: 9_500_000, payment_method: "Chuyển khoản" }], []);

  const rows = await findOrderItemsForPaymentMethodDrillDown({}, "Tiền mặt", client as never, null);

  assert.deepEqual(rows, []);
});
