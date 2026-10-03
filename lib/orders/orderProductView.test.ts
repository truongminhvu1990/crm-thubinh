import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { makeOverviewFakeClient, makeOverviewScenario, OverviewFakeData } from "@/lib/reports/fakeOverviewClient.testutil";
import { SEPTEMBER_RANGE } from "@/lib/monthlySoldProducts/fakeReportingClient.testutil";

/**
 * Phase 1.5A - PRODUCT view of "Tổng giá trị đơn hàng" / "Giá trị chưa ghi nhận", and the Sold orders that have no
 * product line. Run through the REAL services; only the Supabase client, permissions and the commission / expense
 * lookups are faked (same set as overviewReconciliation.test.ts).
 *
 * What these tests lock:
 *  - sum(product-view rows) === the canonical total of the metric, in every scenario below;
 *  - an order without product lines becomes ONE explicit presentation row (kind "no_items"), never a product;
 *  - an order whose total differs from its lines gets ONE explicit "order_difference" row;
 *  - order-level figures (paid / remaining / order_total) are repeated per row but are NOT additive;
 *  - Sold: itemless orders are reported but add NOTHING to any total, and the Sold definition is untouched.
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

let getOrderValueDetail: typeof import("./orderValueSummary.service").getOrderValueDetail;
let getUnrecognizedOrderDetail: typeof import("./orderValueSummary.service").getUnrecognizedOrderDetail;
let getOrderValueProductDetail: typeof import("./orderValueSummary.service").getOrderValueProductDetail;
let getUnrecognizedProductDetail: typeof import("./orderValueSummary.service").getUnrecognizedProductDetail;
let buildOrderProductRows: typeof import("./orderValueSummary.service").buildOrderProductRows;
let getSoldDetail: typeof import("@/lib/monthlySoldProducts/monthlySoldProducts.service").getSoldDetail;
let getSoldTotals: typeof import("@/lib/monthlySoldProducts/soldDataset").getSoldTotals;

before(async () => {
  ({ getOrderValueDetail, getUnrecognizedOrderDetail, getOrderValueProductDetail, getUnrecognizedProductDetail, buildOrderProductRows } = await import("./orderValueSummary.service"));
  ({ getSoldDetail } = await import("@/lib/monthlySoldProducts/monthlySoldProducts.service"));
  ({ getSoldTotals } = await import("@/lib/monthlySoldProducts/soldDataset"));
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const clientOf = (d: OverviewFakeData) => makeOverviewFakeClient(d) as never;
const scenario = (mutate?: (d: OverviewFakeData) => void) => {
  const d = makeOverviewScenario();
  mutate?.(d);
  return d;
};
const soldFilters = { page: 1, dateFrom: SEPTEMBER_RANGE.start, dateTo: SEPTEMBER_RANGE.end };
const customer = (n: number) => ({ full_name: `Khách ${n}`, customer_code: `KH0${n}` });

// ---------------------------------------------------------------------------
test("pure builder: line rows, an explicit no-product row and a difference row - every order contributes exactly its total", () => {
  const orderRows = [
    { order_id: "A", order_number: "OD-A", order_date: "2026-09-02", customer_id: "c1", customer_name: "K1", customer_code: "KH1", order_status: "Completed", payment_status: "Paid", order_total: 100, paid_amount: 100, remaining_amount: 0, payment_count: 1, recognized: true, sold: true, unrecognized_reason: null },
    { order_id: "B", order_number: "OD-B", order_date: "2026-09-01", customer_id: "c2", customer_name: "K2", customer_code: "KH2", order_status: "Draft", payment_status: "Unpaid", order_total: 30, paid_amount: 0, remaining_amount: 30, payment_count: 0, recognized: false, sold: false, unrecognized_reason: { code: "ORDER_DRAFT" as const, label: "Đơn nháp, chưa hoàn thành" } },
    { order_id: "C", order_number: "OD-C", order_date: "2026-09-01", customer_id: "c3", customer_name: "K3", customer_code: "KH3", order_status: "Completed", payment_status: "Paid", order_total: 55, paid_amount: 55, remaining_amount: 0, payment_count: 1, recognized: true, sold: true, unrecognized_reason: null },
  ];
  const items = [
    { id: "i2", order_id: "A", product_id: "p2", snapshot_sale_price: 40, discount: 0, quantity: 1, line_total: 40, product: { product_code: "SP2", product_name: "Hai", category: "Nhẫn" } },
    { id: "i1", order_id: "A", product_id: "p1", snapshot_sale_price: 60, discount: 0, quantity: 1, line_total: 60, product: [{ product_code: "SP1", product_name: "Một", category: "Vòng tay" }] },
    { id: "i3", order_id: "C", product_id: "p3", snapshot_sale_price: 50, discount: 0, quantity: 1, line_total: 50, product: null },
  ];
  const rows = buildOrderProductRows(orderRows, items);
  assert.deepEqual(rows.map((r) => `${r.order_number}:${r.kind}`), ["OD-A:line", "OD-A:line", "OD-B:no_items", "OD-C:line", "OD-C:order_difference"]);
  assert.deepEqual(rows.map((r) => r.amount), [60, 40, 30, 50, 5]);
  assert.equal(sum(rows.map((r) => r.amount)), 100 + 30 + 55, "sum of the rows == sum of the order totals");
  // the no-product row is a presentation row: no product identity at all
  const none = rows.find((r) => r.kind === "no_items")!;
  assert.deepEqual([none.product_id, none.product_code, none.product_name, none.category, none.quantity], [null, null, null, null, null]);
  assert.equal(none.order_total, 30);
  // order-level figures repeat on both lines of A but its amount is counted once
  const a = rows.filter((r) => r.order_id === "A");
  assert.deepEqual(a.map((r) => r.order_total), [100, 100]);
  assert.equal(sum(a.map((r) => r.amount)), 100);
  assert.equal(rows.find((r) => r.row_key === "i3")?.product_code, null, "a missing product embed does not break the row");
  assert.equal(rows.find((r) => r.row_key === "i1")?.category, "Vòng tay", "array-shaped embed is accepted");
});

test("pure builder: a line without a stored line_total falls back to price x quantity - discount", () => {
  const rows = buildOrderProductRows(
    [{ order_id: "A", order_number: "OD-A", order_date: "2026-09-02", customer_id: "c1", customer_name: "K1", customer_code: null, order_status: "Draft", payment_status: "Unpaid", order_total: 170, paid_amount: 0, remaining_amount: 170, payment_count: 0, recognized: false, sold: false, unrecognized_reason: null }],
    [{ id: "i1", order_id: "A", product_id: "p1", snapshot_sale_price: 100, discount: 30, quantity: 2, line_total: null, product: null }]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 170);
});

// ---------------------------------------------------------------------------
test("Tổng giá trị đơn hàng - product view reconciles EXACTLY to the order view and the canonical total (September fixture)", async () => {
  const d = scenario();
  const product = await getOrderValueProductDetail(SEPTEMBER_RANGE, undefined, clientOf(d));
  const orders = await getOrderValueDetail(SEPTEMBER_RANGE, undefined, clientOf(d));

  assert.equal(product.total, 450);
  assert.equal(product.total, orders.total);
  assert.equal(product.rowsTotal, product.total);
  assert.equal(product.orderCount, orders.count);
  assert.equal(product.count, 7, "O1(1) + O2(2) + O3(1) + O4(1) + O5(1) + O6(1)");
  assert.ok(product.rows.every((r) => r.kind === "line"));
  assert.equal(product.noItemsOrderCount, 0);
  // per order: the product rows add up to that order's total in the order view
  for (const o of orders.rows) assert.equal(sum(product.rows.filter((r) => r.order_id === o.order_id).map((r) => r.amount)), o.order_total, o.order_number);
  // Lost and out-of-range orders are not here, same population as the order view
  assert.ok(!product.rows.some((r) => r.order_number === "ORD-O7" || r.order_number === "ORD-O8"));
});

test("an order with NO product lines is ONE explicit row 'no_items' carrying its total - the total is unchanged", async () => {
  const d = scenario((x) => {
    x.orderItems = x.orderItems.filter((i) => i.id !== "I5" && i.id !== "I6"); // O5 (Reserved unpaid 30) and O6 (Draft 10) lose their products
  });
  const product = await getOrderValueProductDetail(SEPTEMBER_RANGE, undefined, clientOf(d));
  assert.equal(product.total, 450);
  assert.equal(product.rowsTotal, 450, "still reconciles");
  const none = product.rows.filter((r) => r.kind === "no_items");
  assert.deepEqual(none.map((r) => [r.order_number, r.amount]).sort(), [["ORD-O5", 30], ["ORD-O6", 10]]);
  assert.equal(product.noItemsOrderCount, 2);
  assert.equal(product.noItemsTotal, 40);
  assert.ok(none.every((r) => r.product_id === null && r.product_name === null), "never a fake product");
});

test("an order whose total differs from its lines gets ONE 'order_difference' row - still reconciles", async () => {
  const d = scenario((x) => {
    x.orders.find((o) => o.id === "O3")!.total_amount = 55; // lines of O3 add to 50
  });
  const product = await getOrderValueProductDetail(SEPTEMBER_RANGE, undefined, clientOf(d));
  assert.equal(product.total, 455);
  assert.equal(product.rowsTotal, 455);
  const diff = product.rows.filter((r) => r.kind === "order_difference");
  assert.equal(diff.length, 1);
  assert.equal(diff[0].amount, 5);
  assert.equal(product.differenceTotal, 5);
});

test("order-level paid / remaining repeat across the lines of one order and are NOT additive (O2 has two lines)", async () => {
  const d = scenario();
  const product = await getOrderValueProductDetail(SEPTEMBER_RANGE, undefined, clientOf(d));
  const o2 = product.rows.filter((r) => r.order_number === "ORD-O2");
  assert.equal(o2.length, 2);
  assert.deepEqual(o2.map((r) => r.paid_amount), [60, 60]);
  assert.equal(sum(o2.map((r) => r.amount)), 60, "the order's amount is counted once, not once per line");
});

test("Giá trị chưa ghi nhận - product view: exactly the not-(Completed+Paid) orders, reconciles to the canonical figure, reasons and payments equal the order view", async () => {
  const d = scenario();
  const product = await getUnrecognizedProductDetail(SEPTEMBER_RANGE, undefined, clientOf(d));
  const orders = await getUnrecognizedOrderDetail(SEPTEMBER_RANGE, undefined, clientOf(d));

  assert.equal(product.total, 290);
  assert.equal(product.total, orders.total);
  assert.equal(product.rowsTotal, 290);
  assert.equal(product.orderCount, 4);
  assert.deepEqual([...new Set(product.rows.map((r) => r.order_number))].sort(), ["ORD-O3", "ORD-O4", "ORD-O5", "ORD-O6"]);
  assert.ok(product.rows.every((r) => !r.recognized && r.unrecognized_reason !== null));
  for (const o of orders.rows) {
    const mine = product.rows.filter((r) => r.order_id === o.order_id);
    assert.ok(mine.every((r) => r.paid_amount === o.paid_amount && r.remaining_amount === o.remaining_amount && r.unrecognized_reason?.code === o.unrecognized_reason?.code), o.order_number);
  }
});

test("unrecognized product view with itemless orders still reconciles to 290", async () => {
  const d = scenario((x) => {
    x.orderItems = x.orderItems.filter((i) => i.id !== "I5");
  });
  const product = await getUnrecognizedProductDetail(SEPTEMBER_RANGE, undefined, clientOf(d));
  assert.equal(product.rowsTotal, product.total);
  assert.equal(product.total, 290);
  assert.equal(product.noItemsOrderCount, 1);
});

test("an empty period gives an empty, consistent product view", async () => {
  const product = await getOrderValueProductDetail({ start: "2020-01-01", end: "2020-02-01" }, undefined, clientOf(scenario()));
  assert.deepEqual([product.total, product.rowsTotal, product.count, product.orderCount], [0, 0, 0, 0]);
});

// ---------------------------------------------------------------------------
// Sold: itemless orders are reported, never counted
// ---------------------------------------------------------------------------
function withItemlessSold(x: OverviewFakeData) {
  // O10: Reserved with a real payment, no product line  -> Sold by the locked definition, but nothing to list
  x.orders.push({ id: "O10", order_number: "ORD-O10", order_status: "Reserved", payment_status: "PartiallyPaid", order_date: "2026-09-12", total_amount: 80, customer_id: "c1", sales_owner: "Nhân viên A", customer: customer(1) });
  x.payments.push({ order_id: "O10", amount: 5, payment_method: "Bank Transfer" });
  // O11: Completed, unpaid, no product line -> Sold regardless of payment
  x.orders.push({ id: "O11", order_number: "ORD-O11", order_status: "Completed", payment_status: "Unpaid", order_date: "2026-09-13", total_amount: 40, customer_id: "c2", sales_owner: "Nhân viên A", customer: customer(2) });
  // O12: Reserved WITHOUT payment, no product line -> NOT Sold; O13: Draft -> NOT Sold; O14: Lost -> NOT Sold
  x.orders.push({ id: "O12", order_number: "ORD-O12", order_status: "Reserved", payment_status: "Unpaid", order_date: "2026-09-14", total_amount: 10, customer_id: "c3", sales_owner: "Nhân viên A", customer: customer(3) });
  x.orders.push({ id: "O13", order_number: "ORD-O13", order_status: "Draft", payment_status: "Unpaid", order_date: "2026-09-14", total_amount: 10, customer_id: "c3", sales_owner: "Nhân viên A", customer: customer(3) });
  x.orders.push({ id: "O14", order_number: "ORD-O14", order_status: "Lost", payment_status: "Unpaid", order_date: "2026-09-14", total_amount: 10, customer_id: "c3", sales_owner: "Nhân viên A", customer: customer(3) });
}

test("Sold: itemless Sold orders are listed (Reserved+payment and Completed) but Reserved-unpaid / Draft / Lost are not", async () => {
  const detail = await getSoldDetail(soldFilters, clientOf(scenario(withItemlessSold)), null);
  assert.deepEqual(detail.itemlessOrders.map((o) => o.order_number), ["ORD-O11", "ORD-O10"], "newest first");
  const o10 = detail.itemlessOrders.find((o) => o.order_number === "ORD-O10")!;
  assert.equal(o10.total_amount, 80, "the order's own total is shown for information");
  assert.equal(o10.amount_paid, 5);
  assert.equal(o10.remaining_balance, 75);
});

test("Sold: itemless orders add NOTHING - totals, lines and order rows are identical with and without them (Sold definition untouched)", async () => {
  const plain = await getSoldDetail(soldFilters, clientOf(scenario()), null);
  const withIt = await getSoldDetail(soldFilters, clientOf(scenario(withItemlessSold)), null);
  assert.deepEqual(withIt.totals, plain.totals);
  assert.equal(withIt.totals.soldValue, plain.totals.soldValue);
  assert.deepEqual(withIt.products.map((p) => p.line_key), plain.products.map((p) => p.line_key));
  assert.deepEqual(withIt.orders.map((o) => o.order_id), plain.orders.map((o) => o.order_id));
  assert.equal(sum(withIt.products.map((p) => p.final_sale_price)), withIt.totals.soldValue);
  assert.deepEqual(await getSoldTotals(soldFilters, clientOf(scenario(withItemlessSold)), null), await getSoldTotals(soldFilters, clientOf(scenario()), null));
  assert.deepEqual(plain.itemlessOrders, [], "the base fixture has none");
});

test("Sold: customer and category filters apply to itemless orders consistently (an order with no product has no category)", async () => {
  const d = scenario(withItemlessSold);
  const byCustomer = await getSoldDetail({ ...soldFilters, customer: "KH02" }, clientOf(d), null);
  assert.deepEqual(byCustomer.itemlessOrders.map((o) => o.order_number), ["ORD-O11"]);
  const byCategory = await getSoldDetail({ ...soldFilters, productCategory: "Vòng tay" }, clientOf(d), null);
  assert.deepEqual(byCategory.itemlessOrders, []);
});

test("Sold: every sold line carries its quantity (order lines from order_items, legacy entries = 1)", async () => {
  const detail = await getSoldDetail(soldFilters, clientOf(scenario()), null);
  assert.ok(detail.products.length > 0);
  for (const p of detail.products) assert.equal(p.quantity, 1, p.line_key);
  assert.ok(detail.products.some((p) => p.is_legacy), "the legacy BR-002 entry is among them");
});
