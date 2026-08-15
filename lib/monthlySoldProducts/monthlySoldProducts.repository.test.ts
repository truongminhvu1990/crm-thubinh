import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// Same "mock once, inject a fake client per call" shape paymentMethodReport.
// service.test.ts already established: this module transitively imports
// "@/lib/supabase" (throws without env vars) via top-level imports, and
// "@/lib/permission"/"@/lib/permission/dataScope" the same way. Every test
// below passes `staff: null` explicitly, which skips the actual Data Scope
// call (see repository's own `resolvedStaff = staff === undefined ? ... :
// staff` sentinel) — these mocks only exist so the module graph can load.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: { applyDataScopeWithFallback: async (q: unknown) => ({ query: q }) },
});

interface FakeData {
  salesLedgerRows: Record<string, unknown>[];
  customerPurchaseLinks: { id: string; order_item_id: string | null }[];
  orderItems: { id: string; order_id: string; snapshot_sale_price: number; discount: number; orders: { order_number: string; total_amount: number } }[];
  products: { id: string; cost_price: number | null; jade_type: string | null }[];
  payments: { order_id: string; amount: number; payment_method: string }[];
}

function chainable(result: { data: unknown; error: null; count?: number }) {
  const obj: Record<string, unknown> = {
    gte: () => obj,
    lt: () => obj,
    eq: () => obj,
    or: () => obj,
    order: () => obj,
    range: () => obj,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return obj;
}

function makeFakeClient(data: FakeData) {
  return {
    from(table: string) {
      switch (table) {
        case "sales_ledger":
          return { select: () => chainable({ data: data.salesLedgerRows, error: null, count: data.salesLedgerRows.length }) };
        case "customer_purchases":
          return {
            select: () => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({ data: data.customerPurchaseLinks.filter((l) => ids.includes(l.id)), error: null }),
            }),
          };
        case "order_items":
          return {
            select: () => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({ data: data.orderItems.filter((i) => ids.includes(i.id)), error: null }),
            }),
          };
        case "products":
          return {
            select: () => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({ data: data.products.filter((p) => ids.includes(p.id)), error: null }),
            }),
          };
        case "payments":
          return {
            select: () => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({ data: data.payments.filter((p) => ids.includes(p.order_id)), error: null }),
            }),
          };
        default:
          throw new Error(`Unexpected table in test fake: ${table}`);
      }
    },
  };
}

let getMonthlySoldProductsPage: typeof import("./monthlySoldProducts.repository").getMonthlySoldProductsPage;

before(async () => {
  ({ getMonthlySoldProductsPage } = await import("./monthlySoldProducts.repository"));
});

test("Payment Details: single payment on the linked Order — amount_paid/remaining_balance/payment_methods populated from real Order/Payment data", async () => {
  const client = makeFakeClient({
    salesLedgerRows: [
      { purchase_id: "pu1", customer_id: "c1", product_id: "prod1", sale_amount: 9_500_000, sale_date: "2026-08-01", salesperson: "A", salesperson_id: "s1", customer_name: "Khách A", customer_code: "KH01", product_code: "SP01", product_name: "Vòng ngọc", product_category: "Vòng tay" },
    ],
    customerPurchaseLinks: [{ id: "pu1", order_item_id: "oi1" }],
    orderItems: [{ id: "oi1", order_id: "o1", snapshot_sale_price: 10_000_000, discount: 500_000, orders: { order_number: "000001", total_amount: 9_500_000 } }],
    products: [{ id: "prod1", cost_price: 5_000_000, jade_type: "Jadeite" }],
    payments: [{ order_id: "o1", amount: 6_000_000, payment_method: "Tiền mặt" }],
  });

  const { rows } = await getMonthlySoldProductsPage({ page: 1 }, client as never, null);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_paid, 6_000_000);
  assert.equal(rows[0].remaining_balance, 3_500_000);
  assert.equal(rows[0].payment_methods, "Tiền mặt");
});

test("Payment Details: multiple payments with different methods on one Order — both listed (comma-joined), never picked silently", async () => {
  const client = makeFakeClient({
    salesLedgerRows: [
      { purchase_id: "pu1", customer_id: "c1", product_id: "prod1", sale_amount: 9_500_000, sale_date: "2026-08-01", salesperson: "A", salesperson_id: "s1", customer_name: "Khách A", customer_code: "KH01", product_code: "SP01", product_name: "Vòng ngọc", product_category: "Vòng tay" },
    ],
    customerPurchaseLinks: [{ id: "pu1", order_item_id: "oi1" }],
    orderItems: [{ id: "oi1", order_id: "o1", snapshot_sale_price: 10_000_000, discount: 500_000, orders: { order_number: "000001", total_amount: 9_500_000 } }],
    products: [{ id: "prod1", cost_price: 5_000_000, jade_type: "Jadeite" }],
    payments: [
      { order_id: "o1", amount: 5_000_000, payment_method: "Tiền mặt" },
      { order_id: "o1", amount: 4_500_000, payment_method: "Chuyển khoản" },
    ],
  });

  const { rows } = await getMonthlySoldProductsPage({ page: 1 }, client as never, null);

  assert.equal(rows[0].amount_paid, 9_500_000);
  assert.equal(rows[0].remaining_balance, 0);
  assert.equal(rows[0].payment_methods, "Chuyển khoản, Tiền mặt");
});

test("Payment Details: Order with zero payments — amount_paid 0, remaining_balance = total_amount, payment_methods null", async () => {
  const client = makeFakeClient({
    salesLedgerRows: [
      { purchase_id: "pu1", customer_id: "c1", product_id: "prod1", sale_amount: 9_500_000, sale_date: "2026-08-01", salesperson: "A", salesperson_id: "s1", customer_name: "Khách A", customer_code: "KH01", product_code: "SP01", product_name: "Vòng ngọc", product_category: "Vòng tay" },
    ],
    customerPurchaseLinks: [{ id: "pu1", order_item_id: "oi1" }],
    orderItems: [{ id: "oi1", order_id: "o1", snapshot_sale_price: 10_000_000, discount: 500_000, orders: { order_number: "000001", total_amount: 9_500_000 } }],
    products: [{ id: "prod1", cost_price: 5_000_000, jade_type: "Jadeite" }],
    payments: [],
  });

  const { rows } = await getMonthlySoldProductsPage({ page: 1 }, client as never, null);

  assert.equal(rows[0].amount_paid, 0);
  assert.equal(rows[0].remaining_balance, 9_500_000);
  assert.equal(rows[0].payment_methods, null);
});

test("Payment Details: purchase with no linked Order (manual/historical entry) — all three fields null, same treatment as original_price/discount", async () => {
  const client = makeFakeClient({
    salesLedgerRows: [
      { purchase_id: "pu-manual", customer_id: "c1", product_id: "prod1", sale_amount: 3_000_000, sale_date: "2026-08-01", salesperson: "A", salesperson_id: "s1", customer_name: "Khách A", customer_code: "KH01", product_code: "SP01", product_name: "Vòng ngọc", product_category: "Vòng tay" },
    ],
    customerPurchaseLinks: [{ id: "pu-manual", order_item_id: null }],
    orderItems: [],
    products: [{ id: "prod1", cost_price: 1_000_000, jade_type: "Jadeite" }],
    payments: [],
  });

  const { rows } = await getMonthlySoldProductsPage({ page: 1 }, client as never, null);

  assert.equal(rows[0].original_price, null); // pre-existing behavior, confirms this row is genuinely unlinked
  assert.equal(rows[0].amount_paid, null);
  assert.equal(rows[0].remaining_balance, null);
  assert.equal(rows[0].payment_methods, null);
});
