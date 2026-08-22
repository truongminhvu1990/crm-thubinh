import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Finance Project #1, Phase D — Net Profit Commission Subtraction (Product
 * Owner Approval, 2026-08-21). getMonthlySoldProductsSummary is the ONLY
 * existing surface that already computed a Net Profit ("Lãi/Lỗ ròng")
 * figure before this phase — this suite proves the extended formula
 * (Revenue − Product Cost − Partner Compensation − Staff Commission −
 * Operating Expenses) is wired correctly, that the Owner/Manager-only gate
 * still nulls out every cost-derived field together, and that a zero-
 * commission Order regresses to the pre-Phase-D figure exactly.
 *
 * Dependencies are stubbed at the module boundary, same convention every
 * other service test in this codebase uses: the repository, Operating
 * Expenses, Permission Center role resolution, and the new
 * lib/reports/commissionExpense.ts are all mocked; this file only proves
 * getMonthlySoldProductsSummary's own composition/formula. `staff` is
 * always passed explicitly (never undefined) so canViewCostAndProfit
 * never calls the real getCurrentStaff().
 */

let aggregateRowsResult: unknown = { source: [], derivedByPurchaseId: new Map() };
let operatingExpensesResult = 0;
let roleKey = "Owner";
let commissionResult = { partnerCompensation: 0, staffCommission: 0 };
let lastCommissionScope: { orderIds: string[]; purchaseIds: string[] } | null = null;

mock.module("./monthlySoldProducts.repository", {
  namedExports: {
    getMonthlySoldProductsAggregateRows: async () => aggregateRowsResult,
  },
});
mock.module("@/lib/operatingExpenses/operatingExpenses.service", {
  namedExports: {
    getOperatingExpensesTotal: async () => operatingExpensesResult,
  },
});
mock.module("@/lib/permission/permissionCenter.service", {
  namedExports: {
    resolveRoleForStaff: async () => ({ role_key: roleKey, is_active: true }),
  },
});
mock.module("@/lib/permission", {
  namedExports: {
    getCurrentStaff: async () => {
      throw new Error("getCurrentStaff must never be called — every test passes an explicit staff argument");
    },
  },
});
mock.module("@/lib/reports/commissionExpense", {
  namedExports: {
    getAccrualCommissionExpense: async (scope: { orderIds: string[]; purchaseIds: string[] }) => {
      lastCommissionScope = scope;
      return commissionResult;
    },
  },
});

const OWNER_STAFF = { id: "staff-1", role: "Owner", role_id: null } as never;
const STAFF_ROLE_STAFF = { id: "staff-2", role: "Staff", role_id: null } as never;

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    purchase_id: "purchase-1",
    product_id: "product-1",
    customer_id: "customer-1",
    sale_amount: 1_000_000,
    is_revenue_recognized: true,
    ...overrides,
  };
}

function derived(orderId: string | null, costPrice: number | null) {
  return { order_id: orderId, order_number: null, original_price: null, discount: null, cost_price: costPrice, jade_type: null, amount_paid: null, remaining_balance: null, payment_methods: null };
}

test("getMonthlySoldProductsSummary: Partner Compensation only — profitLoss subtracts it, Staff Commission contributes 0", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  aggregateRowsResult = {
    source: [sourceRow({ purchase_id: "p1" })],
    derivedByPurchaseId: new Map([["p1", derived("order-1", 200_000)]]),
  };
  operatingExpensesResult = 0;
  roleKey = "Owner";
  commissionResult = { partnerCompensation: 100_000, staffCommission: 0 };

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.partnerCompensation, 100_000);
  assert.equal(summary.staffCommission, 0);
  // 1,000,000 revenue − 200,000 COGS − 100,000 partner comp − 0 staff comm − 0 opex
  assert.equal(summary.profitLoss, 700_000);
});

test("getMonthlySoldProductsSummary: Staff Commission only — profitLoss subtracts it, Partner Compensation contributes 0", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  aggregateRowsResult = {
    source: [sourceRow({ purchase_id: "p1" })],
    derivedByPurchaseId: new Map([["p1", derived("order-1", 200_000)]]),
  };
  operatingExpensesResult = 0;
  roleKey = "Owner";
  commissionResult = { partnerCompensation: 0, staffCommission: 50_000 };

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.partnerCompensation, 0);
  assert.equal(summary.staffCommission, 50_000);
  assert.equal(summary.profitLoss, 750_000);
});

test("getMonthlySoldProductsSummary: both simultaneously — profitLoss subtracts the sum of both, never one or the other", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  aggregateRowsResult = {
    source: [sourceRow({ purchase_id: "p1" })],
    derivedByPurchaseId: new Map([["p1", derived("order-1", 200_000)]]),
  };
  operatingExpensesResult = 0;
  roleKey = "Owner";
  commissionResult = { partnerCompensation: 100_000, staffCommission: 50_000 };

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.profitLoss, 650_000, "1,000,000 − 200,000 − 100,000 − 50,000 − 0");
});

test("getMonthlySoldProductsSummary: zero commission — profitLoss matches the pre-Phase-D formula exactly (Revenue − COGS − OpEx)", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  aggregateRowsResult = {
    source: [sourceRow({ purchase_id: "p1" })],
    derivedByPurchaseId: new Map([["p1", derived("order-1", 200_000)]]),
  };
  operatingExpensesResult = 100_000;
  roleKey = "Owner";
  commissionResult = { partnerCompensation: 0, staffCommission: 0 };

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.partnerCompensation, 0);
  assert.equal(summary.staffCommission, 0);
  assert.equal(summary.profitLoss, 700_000, "1,000,000 − 200,000 − 0 − 0 − 100,000 — identical to the original formula's result");
});

test("getMonthlySoldProductsSummary: Owner/Manager-only gate — a Staff-role viewer never triggers the commission query and every cost-derived field is null", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  aggregateRowsResult = {
    source: [sourceRow({ purchase_id: "p1" })],
    derivedByPurchaseId: new Map([["p1", derived("order-1", 200_000)]]),
  };
  operatingExpensesResult = 0;
  roleKey = "Staff";
  lastCommissionScope = null;
  commissionResult = { partnerCompensation: 999_999, staffCommission: 999_999 }; // would fail the test if it leaked through

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, STAFF_ROLE_STAFF);

  assert.equal(summary.cogs, null);
  assert.equal(summary.partnerCompensation, null);
  assert.equal(summary.staffCommission, null);
  assert.equal(summary.profitLoss, null);
  assert.equal(summary.profitMargin, null);
  assert.equal(lastCommissionScope, null, "the commission expense query must never run for an unpermitted viewer");
});

test("getMonthlySoldProductsSummary: commission expense scope is matched to only the recognized-revenue rows' order_id/purchase_id — never a broader set", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  aggregateRowsResult = {
    source: [
      sourceRow({ purchase_id: "p-recognized", is_revenue_recognized: true }),
      sourceRow({ purchase_id: "p-not-recognized", is_revenue_recognized: false }),
    ],
    derivedByPurchaseId: new Map([
      ["p-recognized", derived("order-recognized", 0)],
      ["p-not-recognized", derived("order-not-recognized", 0)],
    ]),
  };
  operatingExpensesResult = 0;
  roleKey = "Owner";
  commissionResult = { partnerCompensation: 0, staffCommission: 0 };

  await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.deepEqual(lastCommissionScope, { orderIds: ["order-recognized"], purchaseIds: ["p-recognized"] });
});
