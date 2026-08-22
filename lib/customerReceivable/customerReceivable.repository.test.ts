import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Customer Receivable (Finance Project #1, Phase E, Product Owner Approval
 * 2026-08-21) — read-model repository test. Covers the Product Owner's own
 * required scenarios: fully unpaid / partially paid / fully paid / overpaid
 * orders, multiple payments on one order, multiple orders for one customer,
 * payment history/method correctness, correct Outstanding/Overpaid
 * calculation, and no duplicate counting.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeByName: async (query: unknown) => ({ query }),
  },
});

interface FakeResult {
  data: unknown;
  error?: unknown;
}

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function makeClient(perTable: Record<string, FakeResult>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const result = perTable[table];
        if (!result) throw new Error(`Unexpected table in test fake: ${table}`);
        const handler: ProxyHandler<object> = {
          get(_target, prop) {
            const resolved = Promise.resolve({ error: null, ...result });
            if (prop === "then") return resolved.then.bind(resolved);
            if (prop === "catch") return resolved.catch.bind(resolved);
            return (...args: unknown[]) => {
              calls.push({ table, method: String(prop), args });
              return proxy;
            };
          },
        };
        const proxy: unknown = new Proxy({}, handler);
        return proxy;
      },
    } as never,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    order_number: "OD-20260821-000001",
    order_date: "2026-08-21",
    total_amount: 1_000_000,
    customer_id: "customer-1",
    sales_owner: "Nguyen Van A",
    customers: { full_name: "Tran Thi B", customer_code: "KH001" },
    ...overrides,
  };
}

test("findCustomerReceivableOrders: fully unpaid order — Outstanding, remainingBalance = total, amountPaid = 0", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: { data: [order()] },
    payments: { data: [] },
  });

  const rows = await findCustomerReceivableOrders({}, client, null);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountPaid, 0);
  assert.equal(rows[0].remainingBalance, 1_000_000);
  assert.equal(rows[0].settlementState, "Outstanding");
  assert.equal(rows[0].overpaidAmount, 0);
  assert.equal(rows[0].paymentCount, 0);
  assert.equal(rows[0].lastPaymentDate, null);
});

test("findCustomerReceivableOrders: partially paid order — Outstanding, correct remaining amount", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: { data: [order()] },
    payments: { data: [{ order_id: "order-1", amount: 400_000, payment_method: "Tiền mặt", payment_date: "2026-08-15" }] },
  });

  const rows = await findCustomerReceivableOrders({}, client, null);

  assert.equal(rows[0].amountPaid, 400_000);
  assert.equal(rows[0].remainingBalance, 600_000);
  assert.equal(rows[0].settlementState, "Outstanding");
});

test("findCustomerReceivableOrders: fully paid order — Settled, remainingBalance = 0, overpaidAmount = 0", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: { data: [order()] },
    payments: { data: [{ order_id: "order-1", amount: 1_000_000, payment_method: "Tiền mặt", payment_date: "2026-08-16" }] },
  });

  const rows = await findCustomerReceivableOrders({}, client, null);

  assert.equal(rows[0].remainingBalance, 0);
  assert.equal(rows[0].settlementState, "Settled");
  assert.equal(rows[0].overpaidAmount, 0);
});

test("findCustomerReceivableOrders: overpaid order — Overpaid state, correct overpaidAmount, remainingBalance negative and unclamped", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: { data: [order()] },
    payments: { data: [{ order_id: "order-1", amount: 1_200_000, payment_method: "Chuyển khoản", payment_date: "2026-08-17" }] },
  });

  const rows = await findCustomerReceivableOrders({}, client, null);

  assert.equal(rows[0].remainingBalance, -200_000);
  assert.equal(rows[0].settlementState, "Overpaid");
  assert.equal(rows[0].overpaidAmount, 200_000);
});

test("findCustomerReceivableOrders: multiple payments on one order — amountPaid sums all, paymentCount correct, lastPaymentDate is the most recent, no duplicate counting", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: { data: [order()] },
    payments: {
      data: [
        { order_id: "order-1", amount: 300_000, payment_method: "Tiền mặt", payment_date: "2026-08-10" },
        { order_id: "order-1", amount: 300_000, payment_method: "Chuyển khoản", payment_date: "2026-08-15" },
        { order_id: "order-1", amount: 100_000, payment_method: "Tiền mặt", payment_date: "2026-08-05" },
      ],
    },
  });

  const rows = await findCustomerReceivableOrders({}, client, null);

  assert.equal(rows[0].amountPaid, 700_000, "must sum every payment exactly once, never double-counted");
  assert.equal(rows[0].remainingBalance, 300_000);
  assert.equal(rows[0].paymentCount, 3);
  assert.equal(rows[0].lastPaymentDate, "2026-08-15", "must be the most recent payment_date, not the last array entry");
  assert.equal(rows[0].paymentMethods, "Chuyển khoản, Tiền mặt", "every distinct method actually recorded, comma-joined");
});

test("findCustomerReceivableOrders: multiple orders for one customer — each Order is its own row with its own correct figures", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: {
      data: [
        order({ id: "order-1", order_number: "OD-1", total_amount: 1_000_000 }),
        order({ id: "order-2", order_number: "OD-2", total_amount: 500_000 }),
      ],
    },
    payments: {
      data: [
        { order_id: "order-1", amount: 1_000_000, payment_method: "Tiền mặt", payment_date: "2026-08-10" },
        { order_id: "order-2", amount: 200_000, payment_method: "Tiền mặt", payment_date: "2026-08-11" },
      ],
    },
  });

  const rows = await findCustomerReceivableOrders({}, client, null);

  assert.equal(rows.length, 2);
  const row1 = rows.find((r) => r.orderId === "order-1")!;
  const row2 = rows.find((r) => r.orderId === "order-2")!;
  assert.equal(row1.settlementState, "Settled");
  assert.equal(row2.settlementState, "Outstanding");
  assert.equal(row2.remainingBalance, 300_000);
});

test("findCustomerReceivableOrders: excludes Lost orders at the query level", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client, calls } = makeClient({ orders: { data: [] }, payments: { data: [] } });

  await findCustomerReceivableOrders({}, client, null);

  const neqCall = calls.find((c) => c.table === "orders" && c.method === "neq");
  assert.deepEqual(neqCall!.args, ["order_status", "Lost"]);
});

test("findCustomerReceivableOrders: does NOT exclude Cancelled orders (Product Owner Decision, Finding 2, 2026-08-22 — Cancellation never reverses payments/customer_purchases, so a leftover balance is still a real receivable)", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client, calls } = makeClient({ orders: { data: [] }, payments: { data: [] } });

  await findCustomerReceivableOrders({}, client, null);

  const neqCalls = calls.filter((c) => c.table === "orders" && c.method === "neq");
  assert.equal(neqCalls.length, 1, "exactly one exclusion filter must be applied to the orders query");
  assert.deepEqual(neqCalls[0].args, ["order_status", "Lost"], "the only exclusion must be Lost — Cancelled must not be filtered out");
});

test("findCustomerReceivableOrders: a Cancelled order with an outstanding balance is surfaced like any other open order", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: { data: [order({ id: "order-cancelled", order_number: "OD-CANCELLED", total_amount: 1_000_000 })] },
    payments: { data: [{ order_id: "order-cancelled", amount: 400_000, payment_method: "Tiền mặt", payment_date: "2026-08-20" }] },
  });

  const rows = await findCustomerReceivableOrders({}, client, null);

  assert.equal(rows.length, 1, "a Cancelled order must not be dropped by the repository");
  assert.equal(rows[0].remainingBalance, 600_000);
  assert.equal(rows[0].settlementState, "Outstanding");
});

test("findCustomerReceivableOrders: status filter narrows to exactly the requested settlement state", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: {
      data: [
        order({ id: "order-1", order_number: "OD-1" }),
        order({ id: "order-2", order_number: "OD-2" }),
      ],
    },
    payments: {
      data: [{ order_id: "order-1", amount: 1_000_000, payment_method: "Tiền mặt", payment_date: "2026-08-10" }],
    },
  });

  const rows = await findCustomerReceivableOrders({ status: "Outstanding" }, client, null);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].orderId, "order-2");
});

test("findCustomerReceivableOrders: searchTerm matches customer name, customer code, or order number", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({
    orders: {
      data: [
        order({ id: "order-1", order_number: "OD-1", customers: { full_name: "Nguyen Van X", customer_code: "KH001" } }),
        order({ id: "order-2", order_number: "OD-2", customers: { full_name: "Le Thi Y", customer_code: "KH002" } }),
      ],
    },
    payments: { data: [] },
  });

  const rows = await findCustomerReceivableOrders({ searchTerm: "KH002" }, client, null);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].orderId, "order-2");
});

test("findCustomerReceivableOrders: no orders returned — empty result, never throws", async () => {
  const { findCustomerReceivableOrders } = await import("./customerReceivable.repository");
  const { client } = makeClient({ orders: { data: [] } });

  const rows = await findCustomerReceivableOrders({}, client, null);
  assert.deepEqual(rows, []);
});
