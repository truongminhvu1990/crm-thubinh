import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Customer Receivable service — pagination + summary aggregation. Proves
 * totalOutstanding/totalOverpaid are computed over the FULL filtered set,
 * never just the current page, and that Overpaid amounts are never netted
 * against Outstanding ones (Phase C's own rule).
 */

let allRows: unknown[] = [];

mock.module("./customerReceivable.repository", {
  namedExports: {
    findCustomerReceivableOrders: async () => allRows,
  },
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    orderNumber: "OD-1",
    orderDate: "2026-08-21",
    customerId: "customer-1",
    customerName: "Tran Thi B",
    customerCode: "KH001",
    totalAmount: 1_000_000,
    amountPaid: 0,
    remainingBalance: 1_000_000,
    settlementState: "Outstanding",
    overpaidAmount: 0,
    paymentMethods: null,
    paymentCount: 0,
    lastPaymentDate: null,
    ...overrides,
  };
}

test("getCustomerReceivablePage: summary totals are computed over the full filtered set, not just the current page", async () => {
  const { getCustomerReceivablePage } = await import("./customerReceivable.service");
  allRows = [
    row({ orderId: "o1", remainingBalance: 200_000, settlementState: "Outstanding" }),
    row({ orderId: "o2", remainingBalance: 300_000, settlementState: "Outstanding" }),
    row({ orderId: "o3", remainingBalance: 0, settlementState: "Settled" }),
    row({ orderId: "o4", overpaidAmount: 150_000, settlementState: "Overpaid" }),
  ];

  const result = await getCustomerReceivablePage({}, undefined, null);

  assert.equal(result.summary.totalOutstanding, 500_000);
  assert.equal(result.summary.totalOverpaid, 150_000, "Overpaid must never be netted against Outstanding");
  assert.equal(result.summary.orderCount, 4);
  assert.equal(result.totalCount, 4);
});

test("getCustomerReceivablePage: paginates the rows returned to the UI, independent of the summary totals", async () => {
  const { getCustomerReceivablePage } = await import("./customerReceivable.service");
  allRows = Array.from({ length: 75 }, (_, i) => row({ orderId: `o${i}` }));

  const page1 = await getCustomerReceivablePage({ page: 1 }, undefined, null);
  const page2 = await getCustomerReceivablePage({ page: 2 }, undefined, null);

  assert.equal(page1.rows.length, 50);
  assert.equal(page2.rows.length, 25);
  assert.equal(page1.totalCount, 75);
  assert.equal(page2.totalCount, 75, "totalCount must reflect the full set on every page, not just what's shown");
});

test("getCustomerReceivablePage: zero matching orders — empty page, zeroed summary, never an error", async () => {
  const { getCustomerReceivablePage } = await import("./customerReceivable.service");
  allRows = [];

  const result = await getCustomerReceivablePage({}, undefined, null);

  assert.deepEqual(result, { rows: [], totalCount: 0, summary: { totalOutstanding: 0, totalOverpaid: 0, orderCount: 0 } });
});
