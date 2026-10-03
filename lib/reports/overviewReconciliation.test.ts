import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { makeOverviewFakeClient, makeOverviewScenario, OverviewFakeData, FakeInventoryProduct } from "./fakeOverviewClient.testutil";
import { SEPTEMBER_RANGE } from "@/lib/monthlySoldProducts/fakeReportingClient.testutil";

/**
 * Phase 1 - Reporting Foundation: DASHBOARD METRIC == DRILL-DOWN TOTAL for each
 * of the six Overview metrics, run through the REAL services (only the Supabase
 * client, permissions, Operating Expenses and commission lookup are faked).
 *
 * The six metrics are different populations and this file deliberately does
 * NOT force arithmetic between them. The only exact identities asserted are the
 * ones that genuinely hold (within the Orders population; within the Sold
 * population; each metric vs its own drill-down). Where a tempting relationship
 * is false (Total - Recognized != Unrecognized once BR-002 legacy revenue
 * exists; Sold + Held is not a total), a test proves it is false.
 *
 * Fixture (VND thousands, illustrative): see fakeOverviewClient.testutil.ts and
 * the shared SEPTEMBER_SCENARIO.
 *   Orders in range: O1 C/Paid 100, O2 C/Paid 60 (2 lines), O3 C/Partial 50,
 *     O4 Reserved+deposit 200, O5 Reserved unpaid 30, O6 Draft 10; O7 Lost and
 *     the October / August orders are out. L1 = legacy BR-002 purchase 25.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeWithFallback: async (q: unknown) => ({ query: q }),
    applyDataScopeByName: async (q: unknown) => ({ query: q }),
  },
});
let roleKey = "Owner";
mock.module("@/lib/permission/permissionCenter.service", {
  namedExports: { resolveRoleForStaff: async () => ({ role_key: roleKey, is_active: true }) },
});
mock.module("@/lib/operatingExpenses/operatingExpenses.service", { namedExports: { getOperatingExpensesTotal: async () => 0 } });
mock.module("@/lib/reports/commissionExpense", {
  namedExports: { getAccrualCommissionExpense: async () => ({ partnerCompensation: 0, staffCommission: 0 }) },
});

let getOverviewMetrics: typeof import("./overviewMetrics.service").getOverviewMetrics;
let getOrderValueDetail: typeof import("@/lib/orders/orderValueSummary.service").getOrderValueDetail;
let getUnrecognizedOrderDetail: typeof import("@/lib/orders/orderValueSummary.service").getUnrecognizedOrderDetail;
let getRecognizedRevenueDetail: typeof import("./reports.service").getRecognizedRevenueDetail;
let getSoldDetail: typeof import("@/lib/monthlySoldProducts/monthlySoldProducts.service").getSoldDetail;
let getHeldInventoryDetail: typeof import("./inventoryValue.service").getHeldInventoryDetail;
let getRemainingInventoryDetail: typeof import("./inventoryValue.service").getRemainingInventoryDetail;

before(async () => {
  ({ getOverviewMetrics } = await import("./overviewMetrics.service"));
  ({ getOrderValueDetail, getUnrecognizedOrderDetail } = await import("@/lib/orders/orderValueSummary.service"));
  ({ getRecognizedRevenueDetail } = await import("./reports.service"));
  ({ getSoldDetail } = await import("@/lib/monthlySoldProducts/monthlySoldProducts.service"));
  ({ getHeldInventoryDetail, getRemainingInventoryDetail } = await import("./inventoryValue.service"));
});

const client = (data: OverviewFakeData = makeOverviewScenario()) => makeOverviewFakeClient(data) as never;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const soldFilters = (range: { start: string; end: string } | null) => ({ page: 1, dateFrom: range?.start, dateTo: range?.end });

// ---------------------------------------------------------------------------
// 1. Tổng giá trị đơn hàng
// ---------------------------------------------------------------------------
test("1. Tổng giá trị đơn hàng: Overview == drill-down total == sum of rows; Lost / out-of-range excluded", async () => {
  const data = makeOverviewScenario();
  const { metrics, orderValue } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  const detail = await getOrderValueDetail(SEPTEMBER_RANGE, undefined, client(data));

  assert.equal(metrics.totalOrderValue.value, 450, "100+60+50+200+30+10");
  assert.equal(detail.total, metrics.totalOrderValue.value);
  assert.equal(sum(detail.rows.map((r) => r.order_total)), metrics.totalOrderValue.value);
  assert.equal(detail.count, metrics.totalOrderValue.orderCount);
  assert.equal(detail.rows.length, 6);
  assert.deepEqual(detail.summary, orderValue, "the drill-down carries the identical summary the Dashboard uses");
  assert.ok(!detail.rows.some((r) => r.order_status === "Lost" || r.order_number === "ORD-O8" || r.order_number === "ORD-O9"));
});

test("1b. order rows carry every required column, with paid / remaining from REAL payment records", async () => {
  const detail = await getOrderValueDetail(SEPTEMBER_RANGE, undefined, client());
  const byNumber = new Map(detail.rows.map((r) => [r.order_number, r]));

  for (const r of detail.rows) {
    for (const key of ["order_number", "order_date", "customer_name", "order_status", "payment_status", "order_total", "paid_amount", "remaining_amount"] as const) {
      assert.notEqual(r[key], undefined, `${r.order_number} is missing ${key}`);
    }
  }
  const o1 = byNumber.get("ORD-O1")!;
  assert.equal(o1.customer_name, "Khách 1");
  assert.equal(o1.paid_amount, 100);
  assert.equal(o1.remaining_amount, 0);
  const o3 = byNumber.get("ORD-O3")!;
  assert.equal(o3.paid_amount, 20);
  assert.equal(o3.remaining_amount, 30);
  const o4 = byNumber.get("ORD-O4")!;
  assert.deepEqual([o4.paid_amount, o4.remaining_amount, o4.payment_count], [50, 150, 1]);
  const o5 = byNumber.get("ORD-O5")!;
  assert.deepEqual([o5.paid_amount, o5.remaining_amount, o5.payment_count], [0, 30, 0]);

  // recognition / sold flags are informational and follow the LOCKED rules
  assert.equal(o1.recognized, true);
  assert.equal(o3.recognized, false);
  assert.equal(o3.sold, true, "Completed is Sold whatever its payment status");
  assert.equal(o4.sold, true, "Reserved + a real payment record is Sold");
  assert.equal(o5.sold, false, "Reserved without a payment is not Sold");
  assert.equal(byNumber.get("ORD-O6")!.sold, false, "Draft is not Sold");
});

// ---------------------------------------------------------------------------
// 2. Doanh thu đã ghi nhận
// ---------------------------------------------------------------------------
test("2. Doanh thu đã ghi nhận: Overview == drill-down total == sum of rows; BR-001 and BR-002 rows are labelled and both included", async () => {
  const data = makeOverviewScenario();
  const { metrics, purchases } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  const detail = await getRecognizedRevenueDetail(SEPTEMBER_RANGE, client(data), null);

  assert.equal(metrics.recognizedRevenue.value, 185, "P1 100 + P2a 40 + P2b 20 (BR-001) + L1 25 (BR-002); P3 is Completed but partially paid");
  assert.equal(metrics.recognizedRevenue.value, purchases.totalRevenue);
  assert.equal(detail.total, metrics.recognizedRevenue.value);
  assert.equal(sum(detail.rows.map((r) => r.amount)), metrics.recognizedRevenue.value);
  assert.equal(detail.legacyTotal, metrics.recognizedRevenue.legacyValue);
  assert.equal(detail.linkedTotal, metrics.recognizedRevenue.linkedValue);

  const bySourceRule = (rule: string) => detail.rows.filter((r) => r.rule === rule);
  assert.equal(sum(bySourceRule("BR-001").map((r) => r.amount)), 160);
  assert.equal(sum(bySourceRule("BR-002").map((r) => r.amount)), 25);
  assert.ok(detail.rows.every((r) => r.rule_label.length > 0), "every row explains its rule in words");

  const legacy = detail.rows.find((r) => r.purchase_id === "L1")!;
  assert.deepEqual([legacy.rule, legacy.order_id, legacy.order_number], ["BR-002", null, null]);
  const linked = detail.rows.find((r) => r.purchase_id === "P2b")!;
  assert.equal(linked.rule, "BR-001");
  assert.equal(linked.order_number, "ORD-O2");
  assert.equal(linked.order_item_id, "I2b");
  assert.equal(linked.product_code, "SP03");
  assert.equal(linked.customer_name, "Khách 2");
  assert.equal(linked.recognition_date, "2026-09-06");
  assert.equal(linked.payment_status, "Paid");
});

// ---------------------------------------------------------------------------
// 3. Giá trị chưa ghi nhận
// ---------------------------------------------------------------------------
test("3. Giá trị chưa ghi nhận: Overview == drill-down total == sum of rows == the Dashboard breakdown; exactly the non-Completed+Paid orders", async () => {
  const data = makeOverviewScenario();
  const { metrics, orderValue } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  const detail = await getUnrecognizedOrderDetail(SEPTEMBER_RANGE, undefined, client(data));

  assert.equal(metrics.unrecognizedValue.value, 290);
  assert.equal(detail.total, metrics.unrecognizedValue.value);
  assert.equal(sum(detail.rows.map((r) => r.order_total)), metrics.unrecognizedValue.value);
  assert.equal(sum(orderValue.breakdown.map((b) => b.total)), metrics.unrecognizedValue.value);
  assert.equal(detail.count, metrics.unrecognizedValue.orderCount);
  assert.deepEqual(detail.rows.map((r) => r.order_number).sort(), ["ORD-O3", "ORD-O4", "ORD-O5", "ORD-O6"]);
  assert.ok(detail.rows.every((r) => r.recognized === false && r.unrecognized_reason !== null));

  const reason = (n: string) => detail.rows.find((r) => r.order_number === n)!.unrecognized_reason!.code;
  assert.equal(reason("ORD-O3"), "ORDER_NOT_FULLY_PAID");
  assert.equal(reason("ORD-O4"), "ORDER_RESERVED");
  assert.equal(reason("ORD-O5"), "ORDER_RESERVED");
  assert.equal(reason("ORD-O6"), "ORDER_DRAFT");
  const deposit = detail.rows.find((r) => r.order_number === "ORD-O4")!;
  assert.ok(deposit.unrecognized_reason!.label.includes("cọc"), "a deposit is described as one");
  assert.deepEqual([deposit.order_total, deposit.paid_amount, deposit.remaining_amount], [200, 50, 150]);
});

// ---------------------------------------------------------------------------
// Relationships: what holds, and what must NOT be forced
// ---------------------------------------------------------------------------
test("RELATIONSHIPS: Total = Completed+Paid orders + Unrecognized holds (one orders population); it is NOT Total - Recognized Revenue once BR-002 legacy revenue exists", async () => {
  const { metrics, orderValue } = await getOverviewMetrics(SEPTEMBER_RANGE, client(), null);

  // exact, same population (orders):
  assert.equal(metrics.totalOrderValue.value, orderValue.orderBasedRecognizedValue + metrics.unrecognizedValue.value);
  assert.equal(orderValue.totalOrderCount, orderValue.recognizedOrderCount + orderValue.unrecognizedOrderCount);

  // tempting but FALSE across populations - the Dashboard must never derive it:
  const naive = metrics.totalOrderValue.value - metrics.recognizedRevenue.value;
  assert.equal(naive, 265);
  assert.notEqual(naive, metrics.unrecognizedValue.value, "450 - 185 (incl. 25 legacy) != 290");
  assert.equal(metrics.recognizedRevenue.legacyValue, 25, "the gap is exactly the BR-002 revenue that has no Order");
});

test("RELATIONSHIPS: recognized revenue's BR-001 part equals the order-based recognized figure ONLY while both date bases agree - no relation is forced when they diverge", async () => {
  const agreeing = await getOverviewMetrics(SEPTEMBER_RANGE, client(), null);
  assert.equal(agreeing.metrics.recognizedRevenue.linkedValue, agreeing.orderValue.orderBasedRecognizedValue, "160 == 160 in the aligned fixture");

  // Same orders, but one purchase snapshot dated in October (a different date basis).
  const data = makeOverviewScenario();
  data.purchases.find((p) => p.id === "P1")!.sale_date = "2026-10-03";
  const diverged = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  assert.equal(diverged.metrics.recognizedRevenue.linkedValue, 60, "P1 left the period by sale_date");
  assert.equal(diverged.orderValue.orderBasedRecognizedValue, 160, "the order is still in the period by order_date");
  assert.notEqual(diverged.metrics.recognizedRevenue.linkedValue, diverged.orderValue.orderBasedRecognizedValue);
  // ...and both are still individually reconciled to their own drill-downs:
  assert.equal((await getRecognizedRevenueDetail(SEPTEMBER_RANGE, client(data), null)).total, 185 - 100);
});

// ---------------------------------------------------------------------------
// 4/5. Hàng đang giữ / Hàng còn lại
// ---------------------------------------------------------------------------
test("4. Hàng đang giữ: Overview == drill-down total/count == sum of rows; held = status Reserved only, valued at products.sale_price", async () => {
  const data = makeOverviewScenario();
  const { metrics } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  const detail = await getHeldInventoryDetail(client(data));

  assert.deepEqual(metrics.held, { value: 360, count: 4, missingPriceCount: 1 });
  assert.equal(detail.total, metrics.held!.value);
  assert.equal(detail.count, metrics.held!.count);
  assert.equal(sum(detail.rows.map((r) => r.sale_price ?? 0)), metrics.held!.value);
  assert.equal(detail.rows.length, metrics.held!.count);
  assert.ok(detail.rows.every((r) => r.status === "Reserved"), "Sold / Paused / Archived / Available are never held");
  assert.equal(detail.summary.missingPriceCount, 1, "a product with no sale_price is counted but surfaced, never silently priced");
});

test("5. Hàng còn lại: Overview == drill-down total/count == sum of rows; remaining = status Available only; category filter narrows both identically", async () => {
  const data = makeOverviewScenario();
  const { metrics } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  const detail = await getRemainingInventoryDetail(client(data));

  assert.deepEqual(metrics.remaining, { value: 175, count: 3, missingPriceCount: 0 });
  assert.equal(detail.total, metrics.remaining!.value);
  assert.equal(detail.count, metrics.remaining!.count);
  assert.equal(sum(detail.rows.map((r) => r.sale_price ?? 0)), metrics.remaining!.value);
  assert.ok(detail.rows.every((r) => r.status === "Available"));

  const filtered = await getRemainingInventoryDetail(client(data), { category: "Vòng tay" });
  assert.deepEqual([filtered.count, filtered.total], [2, 150]);
  const { getInventoryValueSummary } = await import("./inventoryValue.service");
  const filteredSummary = await getInventoryValueSummary(client(data), { category: "Vòng tay" });
  assert.deepEqual([filteredSummary.remaining.count, filteredSummary.remaining.value], [2, 150], "the metric and its drill-down take the same filter");
});

test("4/5. Held and Remaining are disjoint, and Held + Remaining is the existing locked Inventory Value (Available + Reserved)", async () => {
  const data = makeOverviewScenario();
  const held = await getHeldInventoryDetail(client(data));
  const remaining = await getRemainingInventoryDetail(client(data));

  const heldIds = new Set(held.rows.map((r) => r.product_id));
  assert.ok(remaining.rows.every((r) => !heldIds.has(r.product_id)), "no product is both Held and Remaining");

  const biInventoryValue = sum(data.products.filter((p) => ["Available", "Reserved"].includes(p.status)).map((p) => p.sale_price ?? 0));
  assert.equal(held.total + remaining.total, biInventoryValue, "SUM(sale_price) WHERE status IN (Available, Reserved)");
});

test("Held inventory: the OPEN order holding a product is reported - a Completed history order never overrides it; unlinked holds are counted and flagged", async () => {
  const detail = await getHeldInventoryDetail(client());
  const byCode = new Map(detail.rows.map((r) => [r.product_id, r]));

  const p6 = byCode.get("p6")!;
  assert.equal(p6.holding_order?.order_number, "ORD-O5", "p6 also appears on the Completed August order O9 - the live hold wins");
  assert.equal(p6.holding_order?.order_status, "Reserved");
  assert.equal(byCode.get("p7")!.holding_order?.order_status, "Draft", "a Draft order can hold a product");
  assert.equal(byCode.get("p11")!.holding_order, null);
  assert.equal(detail.unlinkedCount, 1);
});

// ---------------------------------------------------------------------------
// 6. Đã bán
// ---------------------------------------------------------------------------
test("6. Đã bán: Overview == drill-down total == sum of order rows == sum of product rows; SOLD = RECOGNIZED + UNRECOGNIZED", async () => {
  const data = makeOverviewScenario();
  const { metrics } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  const detail = await getSoldDetail(soldFilters(SEPTEMBER_RANGE), client(data), null);

  assert.equal(metrics.sold!.value, 435, "O1 100 + O2 60 + O3 50 + O4 200 + legacy L1 25");
  assert.equal(detail.totals.soldValue, metrics.sold!.value);
  assert.equal(sum(detail.orders.map((o) => o.sold_value)), metrics.sold!.value);
  assert.equal(sum(detail.products.map((p) => p.final_sale_price)), metrics.sold!.value);
  assert.equal(detail.totals.soldValue, detail.totals.recognizedRevenue + detail.totals.unrecognizedValue);
  assert.deepEqual([metrics.sold!.recognizedValue, metrics.sold!.unrecognizedValue], [185, 250]);
  assert.equal(detail.orders.length, metrics.sold!.orderCount);
  assert.equal(detail.products.length, metrics.sold!.lineCount);
});

test("6b. the LOCKED Sold definition holds on the dataset: Completed, and Reserved + a real payment; Draft / Reserved unpaid / Lost never appear", async () => {
  const detail = await getSoldDetail(soldFilters(SEPTEMBER_RANGE), client(), null);
  const numbers = detail.orders.map((o) => o.order_number).filter((n): n is string => !!n).sort();
  assert.deepEqual(numbers, ["ORD-O1", "ORD-O2", "ORD-O3", "ORD-O4"]);
  assert.equal(detail.orders.filter((o) => o.is_legacy).length, 1, "the BR-002 legacy entry is one row");

  const o4 = detail.orders.find((o) => o.order_number === "ORD-O4")!;
  assert.deepEqual([o4.order_status, o4.recognition, o4.sold_value, o4.amount_paid], ["Reserved", "unrecognized", 200, 50]);
  assert.equal(detail.orders.find((o) => o.order_number === "ORD-O2")!.product_count, 2, "one order, two product lines");
});

test("6c. Sold is a different population from Tổng giá trị đơn hàng and is not presented as it", async () => {
  const { metrics } = await getOverviewMetrics(SEPTEMBER_RANGE, client(), null);
  assert.notEqual(metrics.sold!.value, metrics.totalOrderValue.value, "435 vs 450 - Draft and Reserved-unpaid are in one, not the other");
  assert.notEqual(metrics.sold!.unrecognizedValue, metrics.unrecognizedValue.value, "250 vs 290");
});

test("LOCKED overlap: a product on a Reserved order with a real payment is BOTH Sold and Held, and the two are never added together", async () => {
  const data = makeOverviewScenario();
  const sold = await getSoldDetail(soldFilters(SEPTEMBER_RANGE), client(data), null);
  const held = await getHeldInventoryDetail(client(data));
  const { metrics } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);

  const soldCodes = new Set(sold.products.map((p) => p.product_code));
  const heldRow = held.rows.find((r) => r.product_id === "p5")!;
  assert.ok(soldCodes.has("SP05"), "p5 (O4: Reserved + payment) is in the Sold dataset");
  assert.equal(heldRow.also_counted_as_sold, true, "...and in Held, explicitly flagged as the overlap");

  // The other held products are NOT sold:
  assert.equal(held.rows.find((r) => r.product_id === "p6")!.also_counted_as_sold, false, "Reserved, no payment");
  assert.equal(held.rows.find((r) => r.product_id === "p7")!.also_counted_as_sold, false, "Draft");
  assert.ok(!soldCodes.has("SP06") && !soldCodes.has("SP07"));

  // No field anywhere combines populations:
  assert.deepEqual(
    Object.keys(metrics).sort(),
    ["held", "range", "recognizedRevenue", "remaining", "sold", "totalOrderValue", "unrecognizedValue"],
    "exactly the six metrics (+ range) - no sold+held, held+remaining or recognized+unrecognized total"
  );
});

test("Sold gross profit stays Owner/Manager-only on the drill-down, exactly like the report", async () => {
  // The route always passes a real, server-resolved staff (a null staff is
  // "not permitted" by the existing canViewCostAndProfit rule).
  const staff = { id: "staff-1", full_name: "Test Staff", role: "Owner", role_id: null } as never;
  roleKey = "Owner";
  const owner = await getSoldDetail(soldFilters(SEPTEMBER_RANGE), client(), staff);
  assert.ok(owner.products.some((p) => p.gross_profit !== null));
  roleKey = "Sales";
  const sales = await getSoldDetail(soldFilters(SEPTEMBER_RANGE), client(), staff);
  assert.ok(sales.products.every((p) => p.gross_profit === null));
  assert.equal(sales.totals.soldValue, owner.totals.soldValue, "visibility never changes the total");
  roleKey = "Owner";
});

// ---------------------------------------------------------------------------
// Same date context + all-time + paging
// ---------------------------------------------------------------------------
test("the same range reconciles for ALL range-based metrics, in a month AND all-time (null)", async () => {
  for (const range of [SEPTEMBER_RANGE, null]) {
    const data = makeOverviewScenario();
    const { metrics } = await getOverviewMetrics(range, client(data), null);
    assert.equal((await getOrderValueDetail(range, undefined, client(data))).total, metrics.totalOrderValue.value);
    assert.equal((await getRecognizedRevenueDetail(range, client(data), null)).total, metrics.recognizedRevenue.value);
    assert.equal((await getUnrecognizedOrderDetail(range, undefined, client(data))).total, metrics.unrecognizedValue.value);
    assert.equal((await getSoldDetail(soldFilters(range), client(data), null)).totals.soldValue, metrics.sold!.value);
  }
});

test("a range with no data reconciles to zero everywhere, never an error", async () => {
  const empty = { start: "2025-01-01", end: "2025-02-01" };
  const { metrics } = await getOverviewMetrics(empty, client(), null);
  assert.equal(metrics.totalOrderValue.value, 0);
  assert.equal(metrics.recognizedRevenue.value, 0);
  assert.equal(metrics.unrecognizedValue.value, 0);
  assert.equal(metrics.sold!.value, 0);
  assert.equal((await getOrderValueDetail(empty, undefined, client())).rows.length, 0);
});

test("inventory reads page past the 1000-row cap: 2,500 Available products are all counted and valued", async () => {
  const many: FakeInventoryProduct[] = Array.from({ length: 2500 }, (_, i) => ({
    id: `bulk-${String(i).padStart(5, "0")}`,
    product_code: `B${i}`,
    product_name: `Bulk ${i}`,
    category: "Vòng tay",
    status: "Available",
    sale_price: 10,
    batch_id: null,
    salesperson: "Nhân viên A",
  }));
  const data = { ...makeOverviewScenario(), products: many };
  const { metrics } = await getOverviewMetrics(SEPTEMBER_RANGE, client(data), null);
  assert.deepEqual(metrics.remaining, { value: 25_000, count: 2500, missingPriceCount: 0 });
  assert.equal((await getRemainingInventoryDetail(client(data))).rows.length, 2500);
});
