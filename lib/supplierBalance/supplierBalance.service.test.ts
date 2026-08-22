import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/** Supplier Balance service — summary aggregation. Proves supplierCount is
 * a DISTINCT party count (not row count, since one Supplier can have
 * multiple currency rows) and that no cross-currency monetary total is
 * ever computed (summing VND + CNY together would be meaningless). */

let rows: unknown[] = [];

mock.module("./supplierBalance.repository", {
  namedExports: {
    findSupplierBalances: async () => rows,
  },
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    partyId: "supplier-1",
    supplierName: "NCC Nguyen",
    supplierCode: "SUP001",
    currency: "CNY",
    totalIn: 100_000,
    totalOut: 0,
    balance: 100_000,
    lastTransactionDate: "2026-08-10",
    transactionCount: 1,
    ...overrides,
  };
}

test("getSupplierBalancePage: supplierCount is a distinct party count, not the row count", async () => {
  const { getSupplierBalancePage } = await import("./supplierBalance.service");
  rows = [
    row({ partyId: "supplier-1", currency: "VND" }),
    row({ partyId: "supplier-1", currency: "CNY" }),
    row({ partyId: "supplier-2", currency: "VND" }),
  ];

  const result = await getSupplierBalancePage({});

  assert.equal(result.summary.supplierCount, 2, "supplier-1 has 2 currency rows but is only 1 supplier");
  assert.equal(result.summary.rowCount, 3);
  assert.equal(result.rows.length, 3);
});

test("getSupplierBalancePage: no field anywhere sums balance across different currencies", async () => {
  const { getSupplierBalancePage } = await import("./supplierBalance.service");
  rows = [row({ currency: "VND", balance: 5_000_000 }), row({ currency: "CNY", balance: 1000 })];

  const result = await getSupplierBalancePage({});

  const summaryKeys = Object.keys(result.summary);
  assert.deepEqual(summaryKeys.sort(), ["rowCount", "supplierCount"], "the summary must never carry a combined monetary total across currencies");
});

test("getSupplierBalancePage: empty result — zeroed summary, never an error", async () => {
  const { getSupplierBalancePage } = await import("./supplierBalance.service");
  rows = [];

  const result = await getSupplierBalancePage({});
  assert.deepEqual(result, { rows: [], summary: { supplierCount: 0, rowCount: 0 } });
});
