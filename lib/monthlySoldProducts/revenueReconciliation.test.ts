import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { makeFakeReportingClient, SEPTEMBER_SCENARIO, SEPTEMBER_RANGE, FakeData } from "./fakeReportingClient.testutil";

/**
 * Revenue & Sales Reporting Unification (revised after Release Control) -
 * RECONCILIATION between the Dashboard revenue cards and Monthly Sold
 * Products, run against the SAME fixture through the REAL repository /
 * service / order-value / purchase-report code (only the Supabase client,
 * permissions, Operating Expenses and commission lookup are faked).
 *
 * Two DIFFERENT scopes, deliberately never forced into one dataset:
 *
 *  REVENUE scope (Dashboard, unchanged semantics)
 *    - "Doanh thu đã ghi nhận" = getPurchaseReportData().totalRevenue:
 *      customer_purchases by sale_date, BR-001 (Completed + Paid) +
 *      BR-002 (LOCKED: legacy purchase with no Order is recognized).
 *    - "Tổng giá trị đơn hàng" / "Giá trị đơn chưa ghi nhận": every
 *      non-Lost Order by order_date and its Completed+Paid complement
 *      (getOrderValueSummary) - includes Draft / Reserved-unpaid.
 *  SOLD scope (Monthly Sold Products)
 *    - Completed (any payment) OR Reserved with >= 1 payment, by order_date,
 *      plus BR-002 legacy entries; split into recognized / unrecognized.
 *
 * Identities that must hold, and the ones that must NOT be forced:
 *  - Dashboard Orders view: TOTAL = Completed+Paid + UNRECOGNIZED (one query).
 *  - Sold: SOLD = RECOGNIZED + UNRECOGNIZED.
 *  - Sold RECOGNIZED keeps BR-001 + BR-002 semantics = Dashboard recognized
 *    (when both date bases agree); BR-002 revenue is never removed.
 *  - Dashboard Total is NOT the Sold Total.
 * The fixture mirrors the SHAPE of the September 2026 reference case (few
 * recognized orders, many unrecognized ones) with small illustrative
 * numbers; no production figure is hard-coded.
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
let getPurchaseReportData: typeof import("@/lib/reports/reports.service").getPurchaseReportData;

before(async () => {
  ({ getMonthlySoldProductsSummary, getMonthlySoldProductsPage } = await import("./monthlySoldProducts.service"));
  ({ getOrderValueSummary } = await import("@/lib/orders/orderValueSummary.service"));
  ({ getPurchaseReportData } = await import("@/lib/reports/reports.service"));
});

const SEPT = { page: 1, month: "2026-09" };
const client = (data: FakeData = SEPTEMBER_SCENARIO) => makeFakeReportingClient(data) as never;
const clone = (): FakeData => JSON.parse(JSON.stringify(SEPTEMBER_SCENARIO));

async function all(data: FakeData = SEPTEMBER_SCENARIO) {
  const orders = await getOrderValueSummary(SEPTEMBER_RANGE, undefined, client(data));
  const purchases = await getPurchaseReportData(SEPTEMBER_RANGE, client(data), null);
  const sold = await getMonthlySoldProductsSummary(SEPT, client(data), OWNER);
  const page = await getMonthlySoldProductsPage(SEPT, client(data), OWNER);
  return { orders, purchases, sold, page };
}

test("Dashboard Orders view: TOTAL = Completed+Paid + UNRECOGNIZED exactly (one query), Lost excluded, drill-down sums to the unrecognized card", async () => {
  const { orders } = await all();
  assert.equal(orders.totalOrderValue, 450, "100+60+50+200+30+10; the 500 Lost order and the October order are out");
  assert.equal(orders.orderBasedRecognizedValue, 160);
  assert.equal(orders.orderBasedUnrecognizedValue, 290);
  assert.equal(orders.totalOrderValue, orders.orderBasedRecognizedValue + orders.orderBasedUnrecognizedValue);
  assert.equal(orders.totalOrderCount, orders.recognizedOrderCount + orders.unrecognizedOrderCount);
  assert.equal(orders.breakdown.reduce((sum, r) => sum + r.total, 0), orders.orderBasedUnrecognizedValue);
});

test("Dashboard Recognized Revenue semantics are UNCHANGED: purchases by sale_date, BR-001 + BR-002 — Completed+Paid linked purchases plus the legacy purchase; partial / deposit excluded", async () => {
  const { purchases } = await all();
  assert.equal(purchases.totalRevenue, 185, "P1 100 + P2a 40 + P2b 20 (Completed+Paid) + L1 25 (BR-002); P3 (Completed, partially paid) is out");
  assert.equal(purchases.legacyRecognizedRevenue, 25);
  assert.equal(purchases.totalRevenue - purchases.legacyRecognizedRevenue, 160, "linked-to-Completed+Paid part");
});

test("BR-002 is preserved end to end: removing the legacy purchase lowers BOTH Dashboard recognized revenue and Sold recognized revenue by exactly that amount — it is inside recognized, not outside it", async () => {
  const withLegacy = await all();
  const data = clone();
  data.purchases = data.purchases.filter((p) => p.id !== "L1");
  const without = await all(data);

  assert.equal(withLegacy.purchases.totalRevenue - without.purchases.totalRevenue, 25);
  assert.equal(withLegacy.sold.recognizedRevenue - without.sold.recognizedRevenue, 25);
  assert.equal(withLegacy.sold.legacyRecognizedValue, 25);
  assert.equal(without.sold.legacyRecognizedValue, 0);
});

test("Sold RECOGNIZED = Dashboard Recognized Revenue (same BR-001 + BR-002 semantics) when both date bases agree", async () => {
  const { purchases, sold } = await all();
  assert.equal(sold.recognizedRevenue, purchases.totalRevenue);
  assert.equal(sold.legacyRecognizedValue, purchases.legacyRecognizedRevenue);
});

test("Sold: SOLD = RECOGNIZED + UNRECOGNIZED; deposit (Reserved + payment) and Completed-not-Paid are Sold but Unrecognized", async () => {
  const { sold } = await all();
  assert.equal(sold.soldValue, sold.recognizedRevenue + sold.unrecognizedValue);
  assert.equal(sold.unrecognizedValue, 250, "Completed / partially paid 50 + Reserved deposit 200");
  assert.equal(sold.totalOrders, sold.recognizedOrders + sold.unrecognizedOrders);
});

test("Sold scope rules on rows: Reserved-unpaid, Draft, Lost and out-of-range orders never appear; every row carries its recognition status", async () => {
  const { page } = await all();
  const numbers = page.rows.map((r) => r.order_number);
  for (const excluded of ["ORD-O5", "ORD-O6", "ORD-O7", "ORD-O8"]) assert.equal(numbers.includes(excluded), false, excluded);
  for (const r of page.rows) {
    if (r.is_legacy) continue;
    const expected = r.order_status === "Completed" && r.payment_status === "Paid" ? "recognized" : "unrecognized";
    assert.equal(r.recognition, expected, `${r.order_number}: Completed + Paid = Sold + Recognized, anything else sold = Unrecognized`);
  }
  assert.ok(page.rows.some((r) => r.order_status === "Reserved" && r.recognition === "unrecognized"));
  assert.ok(page.rows.some((r) => r.order_status === "Completed" && r.payment_status !== "Paid" && r.recognition === "unrecognized"));
});

test("Dashboard TOTAL and Sold TOTAL are NOT forced to the same dataset — the gap is exactly the non-sold Orders (Reserved without deposit + Draft)", async () => {
  const { orders, sold } = await all();
  const soldOrderBased = sold.soldValue - sold.legacyRecognizedValue;
  assert.notEqual(orders.totalOrderValue, soldOrderBased);
  assert.equal(orders.totalOrderValue - soldOrderBased, 30 + 10);
});

test("date bases are independent by design: a purchase dated Aug 31 for a Sep 5 order leaves Dashboard recognized revenue (sale_date) but Sold Products (order_date) still lists the order", async () => {
  const data = clone();
  data.purchases.find((p) => p.id === "P1")!.sale_date = "2026-08-31";
  const { purchases, sold } = await all(data);
  assert.equal(purchases.totalRevenue, 85, "Dashboard basis untouched: P1 moved out of September by its sale_date");
  assert.equal(sold.recognizedRevenue, 185, "Sold Products uses the Order's order_date");
});

test("row-level: the rows the table lists sum to the Summary cards (no double counting, none dropped) and each Order's lines sum to its total_amount", async () => {
  const { sold, page } = await all();
  assert.equal(page.totalCount, sold.soldLines);
  assert.equal(page.rows.reduce((s, r) => s + r.final_sale_price, 0), sold.soldValue);
  assert.equal(page.rows.filter((r) => r.recognition === "recognized").reduce((s, r) => s + r.final_sale_price, 0), sold.recognizedRevenue);

  const byOrder = new Map<string, number>();
  for (const r of page.rows) if (r.order_id) byOrder.set(r.order_id, (byOrder.get(r.order_id) ?? 0) + r.final_sale_price);
  for (const o of SEPTEMBER_SCENARIO.orders) if (byOrder.has(o.id)) assert.equal(byOrder.get(o.id), o.total_amount, `order ${o.id}`);
});

test("when every sold order is Completed + Paid and there is no legacy entry, Sold and Dashboard recognized agree and unrecognized is zero", async () => {
  const data: FakeData = {
    orders: SEPTEMBER_SCENARIO.orders.filter((o) => o.id === "O1" || o.id === "O2"),
    orderItems: SEPTEMBER_SCENARIO.orderItems.filter((i) => i.order_id === "O1" || i.order_id === "O2"),
    purchases: SEPTEMBER_SCENARIO.purchases.filter((p) => p.id === "P1" || p.id === "P2a" || p.id === "P2b"),
    payments: SEPTEMBER_SCENARIO.payments,
    staff: SEPTEMBER_SCENARIO.staff,
  };
  const { orders, purchases, sold } = await all(data);
  assert.equal(orders.orderBasedUnrecognizedValue, 0);
  assert.equal(sold.unrecognizedValue, 0);
  assert.equal(sold.recognizedRevenue, purchases.totalRevenue);
  assert.equal(sold.soldValue, orders.totalOrderValue);
});
