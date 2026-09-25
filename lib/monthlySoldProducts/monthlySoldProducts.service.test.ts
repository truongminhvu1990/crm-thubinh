import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * getMonthlySoldProductsSummary composition/formula tests.
 *
 * (1) Finance Project #1, Phase D (2026-08-21) - Net Profit = Recognized
 * Revenue − Product Cost − Partner Compensation − Staff Commission −
 * Operating Expenses, still gated to Owner/Manager and still scoped to
 * recognized lines only.
 * (2) Revenue & Sales Reporting Unification - SOLD VALUE = RECOGNIZED +
 * UNRECOGNIZED, order counts, and "unrecognized lines never reach profit,
 * cost or commission".
 *
 * Dependencies are stubbed at the module boundary: the repository (which now
 * hands the service a single list of sold lines), Operating Expenses,
 * Permission Center role resolution and lib/reports/commissionExpense.
 * `staff` is always passed explicitly so canViewCostAndProfit never calls the
 * real getCurrentStaff().
 */

let linesResult: unknown[] = [];
let operatingExpensesResult = 0;
let roleKey = "Owner";
let commissionResult = { partnerCompensation: 0, staffCommission: 0 };
let lastCommissionScope: { orderIds: string[]; purchaseIds: string[] } | null = null;

mock.module("./monthlySoldProducts.repository", {
  namedExports: {
    getSoldLines: async () => linesResult,
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

/** A recognized (Completed + Paid) order line by default. */
function line(overrides: Record<string, unknown> = {}) {
  return {
    line_key: "line-1",
    purchase_id: "purchase-1",
    order_id: "order-1",
    order_status: "Completed",
    payment_status: "Paid",
    recognition: "recognized",
    is_legacy: false,
    sale_date: "2026-09-05",
    order_number: "ORD-1",
    customer_id: "customer-1",
    final_sale_price: 1_000_000,
    cost_price: 200_000,
    ...overrides,
  };
}

function reset(lines: unknown[], opts: { opex?: number; role?: string; commission?: { partnerCompensation: number; staffCommission: number } } = {}) {
  linesResult = lines;
  operatingExpensesResult = opts.opex ?? 0;
  roleKey = opts.role ?? "Owner";
  commissionResult = opts.commission ?? { partnerCompensation: 0, staffCommission: 0 };
  lastCommissionScope = null;
}

test("Phase D: Partner Compensation only — profitLoss subtracts it, Staff Commission contributes 0", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([line()], { commission: { partnerCompensation: 100_000, staffCommission: 0 } });

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.partnerCompensation, 100_000);
  assert.equal(summary.staffCommission, 0);
  assert.equal(summary.profitLoss, 700_000, "1,000,000 revenue − 200,000 COGS − 100,000 partner comp");
});

test("Phase D: Staff Commission only — profitLoss subtracts it, Partner Compensation contributes 0", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([line()], { commission: { partnerCompensation: 0, staffCommission: 50_000 } });

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.profitLoss, 750_000);
});

test("Phase D: both simultaneously — profitLoss subtracts the sum of both", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([line()], { commission: { partnerCompensation: 100_000, staffCommission: 50_000 } });

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.profitLoss, 650_000, "1,000,000 − 200,000 − 100,000 − 50,000 − 0");
});

test("Phase D: zero commission — profitLoss = Revenue − COGS − OpEx exactly", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([line()], { opex: 100_000 });

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(summary.profitLoss, 700_000);
});

test("Owner/Manager-only gate — a Staff-role viewer never triggers the commission query and every cost-derived field is null, while revenue figures stay visible", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([line()], { role: "Staff", commission: { partnerCompensation: 999_999, staffCommission: 999_999 } });

  const summary = await getMonthlySoldProductsSummary({ page: 1 }, undefined, STAFF_ROLE_STAFF);

  assert.equal(summary.cogs, null);
  assert.equal(summary.partnerCompensation, null);
  assert.equal(summary.staffCommission, null);
  assert.equal(summary.profitLoss, null);
  assert.equal(summary.profitMargin, null);
  assert.equal(lastCommissionScope, null, "the commission expense query must never run for an unpermitted viewer");
  assert.equal(summary.recognizedRevenue, 1_000_000);
  assert.equal(summary.soldValue, 1_000_000);
});

test("commission expense scope is only the RECOGNIZED lines' order_id/purchase_id — never an unrecognized (deposit / partially paid) line", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([
    line({ line_key: "a", purchase_id: "p-recognized", order_id: "order-recognized" }),
    line({ line_key: "b", purchase_id: "p-partial", order_id: "order-partial", payment_status: "PartiallyPaid", recognition: "unrecognized" }),
    line({ line_key: "c", purchase_id: null, order_id: "order-deposit", order_status: "Reserved", payment_status: "PartiallyPaid", recognition: "unrecognized" }),
  ]);

  await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.deepEqual(lastCommissionScope, { orderIds: ["order-recognized"], purchaseIds: ["p-recognized"] });
});

test("SOLD VALUE = RECOGNIZED + UNRECOGNIZED, with counts, customers and ratio", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([
    line({ line_key: "1", order_id: "o1", customer_id: "c1", final_sale_price: 100, cost_price: 10 }),
    line({ line_key: "2a", order_id: "o2", customer_id: "c2", final_sale_price: 40, cost_price: 10 }),
    line({ line_key: "2b", order_id: "o2", customer_id: "c2", final_sale_price: 20, cost_price: 10 }),
    line({ line_key: "3", order_id: "o3", customer_id: "c3", final_sale_price: 50, payment_status: "PartiallyPaid", recognition: "unrecognized", cost_price: 10 }),
    line({ line_key: "4", order_id: "o4", customer_id: "c4", final_sale_price: 200, order_status: "Reserved", payment_status: "PartiallyPaid", recognition: "unrecognized", purchase_id: null, cost_price: 10 }),
    line({ line_key: "L", order_id: null, order_status: null, payment_status: null, is_legacy: true, customer_id: "c9", final_sale_price: 25, cost_price: 5 }),
  ]);

  const s = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(s.recognizedRevenue, 185, "Completed+Paid 100+40+20 and BR-002 legacy 25");
  assert.equal(s.unrecognizedValue, 250, "Completed partially paid 50 + Reserved deposit 200");
  assert.equal(s.soldValue, 435);
  assert.equal(s.soldValue, s.recognizedRevenue + s.unrecognizedValue);
  assert.equal(s.soldLines, 6);
  assert.equal(s.recognizedOrders, 3, "o1, o2 (two lines = one order) and the legacy entry");
  assert.equal(s.unrecognizedOrders, 2, "o3 and o4");
  assert.equal(s.totalOrders, s.recognizedOrders + s.unrecognizedOrders);
  assert.equal(s.totalCustomers, 5, "c1, c2 (two lines), c3, c4 and the legacy customer");
  assert.equal(s.recognizedRatio, 185 / 435);
});

test("profit, COGS and commission are computed on RECOGNIZED lines only — an unrecognized line's cost never reduces profit", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([
    line({ line_key: "r", final_sale_price: 1_000, cost_price: 300 }),
    line({ line_key: "u", order_id: "order-2", payment_status: "PartiallyPaid", recognition: "unrecognized", final_sale_price: 5_000, cost_price: 4_000 }),
  ]);

  const s = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(s.cogs, 300);
  assert.equal(s.profitLoss, 700, "1,000 − 300; the 5,000 deposit line and its 4,000 cost are not in the P&L");
  assert.equal(s.profitMargin, 70);
});

test("empty result: all zeros, no division by zero", async () => {
  const { getMonthlySoldProductsSummary } = await import("./monthlySoldProducts.service");
  reset([]);

  const s = await getMonthlySoldProductsSummary({ page: 1 }, undefined, OWNER_STAFF);

  assert.equal(s.soldValue, 0);
  assert.equal(s.recognizedRatio, 0);
  assert.equal(s.profitMargin, 0);
  assert.equal(s.totalOrders, 0);
});

test("getMonthlySoldProductsPage: paginates the same list the Summary reads, strips repo-only fields, nulls gross_profit for non-permitted viewers", async () => {
  const { getMonthlySoldProductsPage } = await import("./monthlySoldProducts.service");
  reset([
    line({ line_key: "1", gross_profit: 800, salesperson_id: "s", sales_owner: "x" }),
    line({ line_key: "2", gross_profit: 100, salesperson_id: "s", sales_owner: "x" }),
  ], { role: "Staff" });

  const page = await getMonthlySoldProductsPage({ page: 1 }, undefined, STAFF_ROLE_STAFF);

  assert.equal(page.totalCount, 2);
  assert.equal(page.rows.length, 2);
  assert.equal(page.rows[0].gross_profit, null);
  assert.equal("cost_price" in page.rows[0], false);
  assert.equal("sales_owner" in page.rows[0], false);
});
