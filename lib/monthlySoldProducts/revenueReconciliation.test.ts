import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { makeFakeReportingClient, SEPTEMBER_SCENARIO, SEPTEMBER_RANGE, FakeData } from "./fakeReportingClient.testutil";

/**
 * Revenue & Sales Reporting Unification - RECONCILIATION between the
 * Dashboard's revenue cards and Monthly Sold Products, run against the SAME
 * fixture through the REAL repository/service/order-value code (only the
 * Supabase client, permissions, Operating Expenses and commission lookup are
 * faked). Proves the Product Owner's required identities:
 *
 *   A. Dashboard TOTAL = RECOGNIZED + UNRECOGNIZED
 *   B. Dashboard and Sold Products share one recognition definition
 *   C. Sold Products SOLD VALUE = SOLD RECOGNIZED + SOLD UNRECOGNIZED
 *   D. Completed + Paid orders keep their recognized revenue (BR-001)
 *   and the deliberate, explainable gap between the two scopes:
 *      Dashboard TOTAL = Sold (order-based) + non-sold Orders
 *      (Reserved without a deposit, Draft) - Lost is in neither.
 *
 * The September-style fixture mirrors the shape of the real September 2026
 * reference case (many unrecognized orders, few recognized ones) with small
 * illustrative numbers - no production figure is hard-coded anywhere.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeWithFallback: async (q: unknown) => ({ query: q }),
    applyDataScopeByName: async (q: unknown) => ({ query: q }),
  },
});
mock.module("@/lib/permission/permissionCenter.service", {
  namedExports: { resolveRoleForStaff: async () => ({ role_key: "Owner", is_active: true }) },
});
mock.module("@/lib/operatingExpenses/operatingExpenses.service", { namedExports: { getOperatingExpensesTotal: async () => 0 } });
mock.module("@/lib/reports/commissionExpense", {
  namedExports: { getAccrualCommissionExpense: async () => ({ partnerCompensation: 0, staffCommission: 0 }) },
});

const OWNER = { id: "staff-1", role: "Owner", role_id: null } as never;

let getMonthlySoldProductsSummary: typeof import("./monthlySoldProducts.service").getMonthlySoldProductsSummary;
let getMonthlySoldProductsPage: typeof import("./monthlySoldProducts.service").getMonthlySoldProductsPage;
let getOrderValueSummary: typeof import("@/lib/orders/orderValueSummary.service").getOrderValueSummary;

before(async () => {
  ({ getMonthlySoldProductsSummary, getMonthlySoldProductsPage } = await import("./monthlySoldProducts.service"));
  ({ getOrderValueSummary } = await import("@/lib/orders/orderValueSummary.service"));
});

const SEPT = { page: 1, month: "2026-09" };
const client = (data: FakeData = SEPTEMBER_SCENARIO) => makeFakeReportingClient(data) as never;

async function both(data: FakeData = SEPTEMBER_SCENARIO) {
  const dashboard = await getOrderValueSummary(SEPTEMBER_RANGE, undefined, client(data));
  const sold = await getMonthlySoldProductsSummary(SEPT, client(data), OWNER);
  const page = await getMonthlySoldProductsPage(SEPT, client(data), OWNER);
  return { dashboard, sold, page };
}

test("A. Dashboard: TOTAL = RECOGNIZED + UNRECOGNIZED, and Lost is excluded", async () => {
  const { dashboard } = await both();
  assert.equal(dashboard.totalOrderValue, 450, "100+60+50+200+30+10; the 500 Lost order and the October order are out");
  assert.equal(dashboard.orderBasedRecognizedValue, 160);
  assert.equal(dashboard.orderBasedUnrecognizedValue, 290);
  assert.equal(dashboard.totalOrderValue, dashboard.orderBasedRecognizedValue + dashboard.orderBasedUnrecognizedValue);
  assert.equal(dashboard.totalOrderCount, dashboard.recognizedOrderCount + dashboard.unrecognizedOrderCount);
  assert.equal(
    dashboard.breakdown.reduce((sum, r) => sum + r.total, 0),
    dashboard.orderBasedUnrecognizedValue,
    "the drill-down sums to exactly the unrecognized card"
  );
});

test("C. Monthly Sold Products: SOLD VALUE = SOLD RECOGNIZED + SOLD UNRECOGNIZED, and includes the Reserved deposit order", async () => {
  const { sold } = await both();
  assert.equal(sold.soldValue, sold.recognizedRevenue + sold.unrecognizedValue);
  assert.equal(sold.unrecognizedValue, 250, "Completed/PartiallyPaid 50 + Reserved deposit 200 — the deposit order is NOT lost");
  assert.equal(sold.totalOrders, sold.recognizedOrders + sold.unrecognizedOrders);
});

test("B + D. Same recognition definition: Sold Products' Order-based recognized revenue equals the Dashboard's recognized revenue exactly (BR-001 unchanged); only BR-002 legacy sits outside the Orders population", async () => {
  const { dashboard, sold } = await both();
  const legacy = 25;
  assert.equal(sold.recognizedRevenue - legacy, dashboard.orderBasedRecognizedValue);
  assert.equal(sold.recognizedOrders - 1 /* legacy entry */, dashboard.recognizedOrderCount);
});

test("Scope bridge: Dashboard TOTAL = Sold (Order-based) + non-sold Orders (Reserved without deposit, Draft) — every unit of the gap is explained", async () => {
  const { dashboard, sold } = await both();
  const soldOrderBased = sold.soldValue - 25; // strip the legacy entry
  const notSoldOrders = 30 + 10; // Reserved/Unpaid + Draft/Unpaid
  assert.equal(dashboard.totalOrderValue, soldOrderBased + notSoldOrders);
  assert.equal(dashboard.orderBasedUnrecognizedValue, sold.unrecognizedValue + notSoldOrders);
});

test("row-level reconciliation: the rows the table lists sum to the Summary cards (no double counting, none dropped)", async () => {
  const { sold, page } = await both();
  assert.equal(page.totalCount, sold.soldLines);
  const rowSum = page.rows.reduce((s, r) => s + r.final_sale_price, 0);
  const recognizedRowSum = page.rows.filter((r) => r.recognition === "recognized").reduce((s, r) => s + r.final_sale_price, 0);
  assert.equal(rowSum, sold.soldValue);
  assert.equal(recognizedRowSum, sold.recognizedRevenue);
  assert.ok(page.rows.some((r) => r.order_status === "Reserved" && r.recognition === "unrecognized"), "deposit line is visible and labeled unrecognized");
});

test("Order total equals the sum of its lines' amounts (the identity Sold Products relies on to match Dashboard order totals)", async () => {
  const { page } = await both();
  const byOrder = new Map<string, number>();
  for (const r of page.rows) if (r.order_id) byOrder.set(r.order_id, (byOrder.get(r.order_id) ?? 0) + r.final_sale_price);
  for (const o of SEPTEMBER_SCENARIO.orders) {
    if (byOrder.has(o.id)) assert.equal(byOrder.get(o.id), o.total_amount, `order ${o.id}`);
  }
});

test("E. historical recognition unchanged: a deposit or partially-paid order never becomes recognized, and a Completed+Paid order never becomes unrecognized", async () => {
  const { page } = await both();
  for (const r of page.rows) {
    if (r.is_legacy) continue;
    const expected = r.order_status === "Completed" && r.payment_status === "Paid" ? "recognized" : "unrecognized";
    assert.equal(r.recognition, expected, `${r.order_number}`);
  }
});

test("when every sold order is Completed + Paid, both scopes collapse to the same recognized total and zero unrecognized", async () => {
  const data: FakeData = {
    orders: SEPTEMBER_SCENARIO.orders.filter((o) => o.id === "O1" || o.id === "O2"),
    orderItems: SEPTEMBER_SCENARIO.orderItems.filter((i) => i.order_id === "O1" || i.order_id === "O2"),
    purchases: SEPTEMBER_SCENARIO.purchases.filter((p) => p.id === "P1" || p.id === "P2a" || p.id === "P2b"),
    payments: SEPTEMBER_SCENARIO.payments,
    staff: SEPTEMBER_SCENARIO.staff,
  };
  const { dashboard, sold } = await both(data);
  assert.equal(dashboard.totalOrderValue, 160);
  assert.equal(dashboard.orderBasedUnrecognizedValue, 0);
  assert.equal(sold.soldValue, 160);
  assert.equal(sold.unrecognizedValue, 0);
  assert.equal(sold.recognizedRevenue, dashboard.orderBasedRecognizedValue);
});
