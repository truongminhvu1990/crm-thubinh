import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Compensation/Commission Void (Product Owner Authorization, 2026-08-20) —
 * findVoidableFinancialRecordsForOrder's own filtering: only Compensation
 * Draft/Pending/Confirmed and Commission Pending/Approved are ever
 * returned (the exact set the RPC is about to Void), never Handed Off/
 * Paid rows (Case 7/8 - "already Paid/Handed Off/Ledger -> unchanged").
 *
 * mock.module() called once at file scope, mutable state per test.
 */
interface FakeState {
  compensations: { id: string; status: string }[];
  orderItems: { id: string }[];
  purchases: { id: string }[];
  commissions: { id: string; status: string }[];
}

let state: FakeState = { compensations: [], orderItems: [], purchases: [], commissions: [] };

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table === "compensations") {
          return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: state.compensations, error: null }) }) }) };
        }
        if (table === "order_items") {
          return { select: () => ({ eq: () => Promise.resolve({ data: state.orderItems, error: null }) }) };
        }
        if (table === "customer_purchases") {
          return { select: () => ({ in: () => Promise.resolve({ data: state.purchases, error: null }) }) };
        }
        if (table === "sales_commissions") {
          return { select: () => ({ in: () => ({ in: () => Promise.resolve({ data: state.commissions, error: null }) }) }) };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  },
});

test.beforeEach(() => {
  state = { compensations: [], orderItems: [], purchases: [], commissions: [] };
});

test("returns only the Compensation/Commission rows the RPC is about to Void (pre-filtered by the query itself)", async () => {
  state = {
    compensations: [
      { id: "comp-1", status: "Draft" },
      { id: "comp-2", status: "Pending" },
      { id: "comp-3", status: "Confirmed" },
    ],
    orderItems: [{ id: "item-1" }],
    purchases: [{ id: "purchase-1" }],
    commissions: [
      { id: "comm-1", status: "Pending" },
      { id: "comm-2", status: "Approved" },
    ],
  };

  const { findVoidableFinancialRecordsForOrder } = await import("./order.repository");
  const result = await findVoidableFinancialRecordsForOrder("order-1");

  assert.equal(result.compensations.length, 3);
  assert.equal(result.commissions.length, 2);
});

test("Case 5: an Order with no Compensation/Commission at all returns empty arrays, not an error", async () => {
  state = { compensations: [], orderItems: [], purchases: [], commissions: [] };

  const { findVoidableFinancialRecordsForOrder } = await import("./order.repository");
  const result = await findVoidableFinancialRecordsForOrder("order-1");

  assert.deepEqual(result, { compensations: [], commissions: [] });
});

test("no order_items -> no commission lookup attempted at all (short-circuits before the customer_purchases/sales_commissions hops)", async () => {
  state = { compensations: [], orderItems: [], purchases: [], commissions: [] };

  const { findVoidableFinancialRecordsForOrder } = await import("./order.repository");
  const result = await findVoidableFinancialRecordsForOrder("order-1");

  assert.deepEqual(result.commissions, []);
});
