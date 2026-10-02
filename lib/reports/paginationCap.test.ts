import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { makeOverviewFakeClient, OverviewFakeData, FakeInventoryProduct } from "./fakeOverviewClient.testutil";
import { applyWindow, newFakeStats, FakeStats, POSTGREST_MAX_ROWS } from "./postgrestFake.testutil";
import type { FakeOrder, FakeOrderItem, FakePurchase } from "@/lib/monthlySoldProducts/fakeReportingClient.testutil";

/**
 * Phase 1.2 - REAL regression test for the PostgREST 1000-row cap.
 *
 * Phase 1.1 proved that an unpaged read returns at most `max-rows` (1000) rows
 * with NO error, and that a truncated Dashboard and a truncated drill-down still
 * agree with each other - so the reconciliation tests alone cannot catch it.
 * These tests therefore run every reporting loader against datasets LARGER than
 * the cap, through a fake that truncates exactly like the server (every
 * response, paged or not, holds at most `maxRows` rows), and compare the results
 * with expectations computed here by plain loops - never with the code under test.
 *
 * They fail if paging is removed from a loader: the fake would then hand back
 * 1000 rows and every count / total / uniqueness assertion below breaks.
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

let getOverviewMetrics: typeof import("./overviewMetrics.service").getOverviewMetrics;
let getOrderValueSummary: typeof import("@/lib/orders/orderValueSummary.service").getOrderValueSummary;
let getOrderValueDetail: typeof import("@/lib/orders/orderValueSummary.service").getOrderValueDetail;
let getUnrecognizedOrderDetail: typeof import("@/lib/orders/orderValueSummary.service").getUnrecognizedOrderDetail;
let getPurchaseReportData: typeof import("./reports.service").getPurchaseReportData;
let getRecognizedRevenueDetail: typeof import("./reports.service").getRecognizedRevenueDetail;
let getSoldDetail: typeof import("@/lib/monthlySoldProducts/monthlySoldProducts.service").getSoldDetail;
let getHeldInventoryDetail: typeof import("./inventoryValue.service").getHeldInventoryDetail;
let getRemainingInventoryDetail: typeof import("./inventoryValue.service").getRemainingInventoryDetail;
let fetchAllRows: typeof import("./selectIn").fetchAllRows;

before(async () => {
  ({ getOverviewMetrics } = await import("./overviewMetrics.service"));
  ({ getOrderValueSummary, getOrderValueDetail, getUnrecognizedOrderDetail } = await import("@/lib/orders/orderValueSummary.service"));
  ({ getPurchaseReportData, getRecognizedRevenueDetail } = await import("./reports.service"));
  ({ getSoldDetail } = await import("@/lib/monthlySoldProducts/monthlySoldProducts.service"));
  ({ getHeldInventoryDetail, getRemainingInventoryDetail } = await import("./inventoryValue.service"));
  ({ fetchAllRows } = await import("./selectIn"));
});

// ---------------------------------------------------------------------------
// Deterministic large dataset (insertion order is SHUFFLED so a loader that
// forgot to order by a unique key would page inconsistently).
// ---------------------------------------------------------------------------
const RANGE = { start: "2026-09-01", end: "2026-10-01" };
const pad = (n: number, w = 5) => String(n).padStart(w, "0");

function rng(seed: number) {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
function shuffle<T>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CUSTOMER = { full_name: "Khách lớn", customer_code: "KHL" };
const PRODUCT = (i: number) => ({ product_code: `SP${pad(i)}`, product_name: `Sản phẩm ${i}`, category: "Vòng tay", jade_type: "Jadeite", cost_price: 10 });

const N = 2400; // in-range orders; the status pattern repeats every 6
const CYCLE = [
  ["Completed", "Paid"],
  ["Completed", "Partially Paid"],
  ["Reserved", "Partially Paid"], // Reserved WITH a payment row -> Sold
  ["Reserved", "Unpaid"], // Reserved, no payment -> not Sold
  ["Draft", "Unpaid"],
  ["Lost", "Unpaid"],
] as const;
const PAYMENT_ROWS_FOR_COMPLETED_PAID = 40; // 200 consecutive orders include ~33-67 such orders = 1,300-2,700 rows in ONE chunk, far over the 1000 cap

interface Big {
  data: OverviewFakeData;
  expect: {
    nonLostCount: number;
    nonLostValue: number;
    completedPaidOrderValue: number;
    purchasesInRange: number; // customer_purchases rows in the sale_date range
    recognizedPurchasesValue: number;
    recognizedPurchasesCount: number;
    legacyInRangeCount: number;
    legacyInRangeValue: number;
    soldOrderCount: number; // sold ORDERS (excluding legacy)
    soldValue: number;
    soldRecognizedValue: number;
    soldLines: number;
    paymentRowsForSoldOrders: number;
  };
}

function buildBig(): Big {
  const orders: FakeOrder[] = [];
  const orderItems: FakeOrderItem[] = [];
  const purchases: FakePurchase[] = [];
  const payments: { id: string; order_id: string; amount: number; payment_method: string }[] = [];

  const e = {
    nonLostCount: 0, nonLostValue: 0, completedPaidOrderValue: 0,
    purchasesInRange: 0, recognizedPurchasesValue: 0, recognizedPurchasesCount: 0,
    legacyInRangeCount: 0, legacyInRangeValue: 0,
    soldOrderCount: 0, soldValue: 0, soldRecognizedValue: 0, soldLines: 0, paymentRowsForSoldOrders: 0,
  };

  for (let i = 0; i < N; i++) {
    const [order_status, payment_status] = CYCLE[i % 6];
    const total = 1000 + (i % 37) * 10;
    const day = String(1 + (i % 28)).padStart(2, "0");
    const id = `O${pad(i)}`;
    orders.push({
      id, order_number: `ORD-${pad(i)}`, order_status, payment_status, order_date: `2026-09-${day}`,
      total_amount: total, customer_id: "c1", sales_owner: "Nhân viên A", customer: CUSTOMER,
    });
    orderItems.push({ id: `I${pad(i)}`, order_id: id, product_id: `P${pad(i)}`, snapshot_sale_price: total, discount: 0, quantity: 1, product: PRODUCT(i) });

    let nPay = 0;
    if (order_status === "Completed" && payment_status === "Paid") nPay = PAYMENT_ROWS_FOR_COMPLETED_PAID;
    else if (order_status === "Completed") nPay = 2;
    else if (order_status === "Reserved" && payment_status === "Partially Paid") nPay = 1;
    else if (order_status === "Draft" && i % 3 === 1) nPay = 1; // a Draft WITH a payment is still not Sold
    for (let k = 0; k < nPay; k++) payments.push({ id: `PAY${pad(i)}-${pad(k, 2)}`, order_id: id, amount: 100, payment_method: "Tiền mặt" });

    // snapshot purchase: Completed orders only, except every 25th (the "no snapshot" shape seen on Dev)
    const hasSnapshot = order_status === "Completed" && i % 25 !== 0;
    if (hasSnapshot) {
      purchases.push({
        id: `P${pad(i)}`, order_item_id: `I${pad(i)}`, customer_id: "c1", product_id: `P${pad(i)}`, sale_price: total,
        sale_date: `2026-09-${day}`, salesperson: "Nhân viên A", salesperson_id: "staff-a", customer: CUSTOMER, product: PRODUCT(i),
      });
      e.purchasesInRange += 1;
      if (order_status === "Completed" && payment_status === "Paid") {
        e.recognizedPurchasesValue += total;
        e.recognizedPurchasesCount += 1;
      }
    }

    if (order_status !== "Lost") {
      e.nonLostCount += 1;
      e.nonLostValue += total;
      if (order_status === "Completed" && payment_status === "Paid") e.completedPaidOrderValue += total;
    }
    const sold = order_status === "Completed" || (order_status === "Reserved" && nPay > 0);
    if (sold) {
      e.soldOrderCount += 1;
      e.soldLines += 1;
      e.soldValue += total; // snapshot sale_price == line total, so the fallback gives the same figure
      e.paymentRowsForSoldOrders += nPay;
      if (order_status === "Completed" && payment_status === "Paid") e.soldRecognizedValue += total;
    }
  }

  // out-of-range orders that must be excluded everywhere (October)
  for (let i = 0; i < 150; i++) {
    const id = `X${pad(i)}`;
    orders.push({ id, order_number: `ORD-${id}`, order_status: "Completed", payment_status: "Paid", order_date: "2026-10-05", total_amount: 777, customer_id: "c1", sales_owner: "Nhân viên A", customer: CUSTOMER });
    orderItems.push({ id: `XI${pad(i)}`, order_id: id, product_id: `XP${pad(i)}`, snapshot_sale_price: 777, discount: 0, quantity: 1, product: PRODUCT(i) });
    purchases.push({ id: `XPUR${pad(i)}`, order_item_id: `XI${pad(i)}`, customer_id: "c1", product_id: `XP${pad(i)}`, sale_price: 777, sale_date: "2026-10-05", salesperson: "Nhân viên A", salesperson_id: "staff-a", customer: CUSTOMER, product: PRODUCT(i) });
  }

  // legacy BR-002 purchases: 1,200 in range (> cap by itself) + 50 outside it
  for (let i = 0; i < 1250; i++) {
    const inRange = i < 1200;
    const price = 500 + (i % 11);
    purchases.push({
      id: `L${pad(i)}`, order_item_id: null, customer_id: "c1", product_id: null, sale_price: price,
      sale_date: inRange ? `2026-09-${String(1 + (i % 28)).padStart(2, "0")}` : "2026-08-10",
      salesperson: "Nhân viên A", salesperson_id: "staff-a", customer: CUSTOMER, product: null,
    });
    if (inRange) {
      e.legacyInRangeCount += 1;
      e.legacyInRangeValue += price;
      e.purchasesInRange += 1;
      e.recognizedPurchasesValue += price; // BR-002: recognized by exception
      e.recognizedPurchasesCount += 1;
    }
  }
  e.soldValue += e.legacyInRangeValue;
  e.soldRecognizedValue += e.legacyInRangeValue;
  e.soldLines += e.legacyInRangeCount;

  return {
    data: {
      orders: shuffle(orders, 1),
      orderItems: shuffle(orderItems, 2),
      purchases: shuffle(purchases, 3),
      payments: shuffle(payments, 4) as never,
      products: [],
      staff: [{ id: "staff-a", full_name: "Nhân viên A" }],
    },
    expect: e,
  };
}

const client = (data: OverviewFakeData, stats?: FakeStats) => makeOverviewFakeClient(data, stats) as never;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const unique = (xs: string[]) => new Set(xs).size;

// ---------------------------------------------------------------------------
// The fake itself must be a faithful cap, or nothing below proves anything.
// ---------------------------------------------------------------------------
test("sanity: the fake truncates like PostgREST - an UNPAGED read of the big dataset returns exactly 1000 rows, and every dataset below exceeds that", () => {
  const { data, expect: e } = buildBig();
  const unpaged = applyWindow(data.orders, {});
  assert.equal(unpaged.data.length, POSTGREST_MAX_ROWS, "silent truncation, no error");
  assert.ok(data.orders.length > POSTGREST_MAX_ROWS);
  assert.ok(e.nonLostCount > POSTGREST_MAX_ROWS, `non-Lost orders in range: ${e.nonLostCount}`);
  assert.ok(e.purchasesInRange > POSTGREST_MAX_ROWS, `purchases in range: ${e.purchasesInRange}`);
  assert.ok(e.soldOrderCount > POSTGREST_MAX_ROWS, `sold orders: ${e.soldOrderCount}`);
  assert.ok(e.legacyInRangeCount > POSTGREST_MAX_ROWS, `legacy purchases in range: ${e.legacyInRangeCount}`);
  assert.ok(e.paymentRowsForSoldOrders > POSTGREST_MAX_ROWS, "payments alone exceed the cap");
  const ranged = applyWindow(data.orders, { range: [0, 4999] });
  assert.equal(ranged.data.length, POSTGREST_MAX_ROWS, "even an explicit larger range is capped by the server");
});

// ---------------------------------------------------------------------------
// 1. Order loader (> 1000 orders)
// ---------------------------------------------------------------------------
test("ORDER loader (> 1000 rows): summary, detail and unrecognized drill-down are COMPLETE - counts, amounts, no duplicates, no lost rows", async () => {
  const { data, expect: e } = buildBig();
  const stats = newFakeStats();

  const summary = await getOrderValueSummary(RANGE, undefined, client(data, stats));
  assert.equal(summary.totalOrderCount, e.nonLostCount);
  assert.equal(summary.totalOrderValue, e.nonLostValue);
  assert.equal(summary.orderBasedRecognizedValue, e.completedPaidOrderValue);
  assert.equal(summary.orderBasedUnrecognizedValue, e.nonLostValue - e.completedPaidOrderValue);
  assert.equal(summary.totalOrderValue, summary.orderBasedRecognizedValue + summary.orderBasedUnrecognizedValue);

  const detail = await getOrderValueDetail(RANGE, undefined, client(data, stats));
  assert.equal(detail.rows.length, e.nonLostCount, "no row lost");
  assert.equal(unique(detail.rows.map((r) => r.order_id)), detail.rows.length, "no row duplicated");
  assert.equal(sum(detail.rows.map((r) => r.order_total)), e.nonLostValue);
  assert.equal(detail.total, e.nonLostValue);
  assert.ok(!detail.rows.some((r) => r.order_status === "Lost" || r.order_date >= "2026-10-01"), "filters preserved");

  const unrec = await getUnrecognizedOrderDetail(RANGE, undefined, client(data, stats));
  assert.equal(unrec.rows.length, e.nonLostCount - data.orders.filter((o) => o.order_status === "Completed" && o.payment_status === "Paid" && o.order_date < "2026-10-01").length);
  assert.equal(unique(unrec.rows.map((r) => r.order_id)), unrec.rows.length);
  assert.equal(unrec.total, e.nonLostValue - e.completedPaidOrderValue);
  assert.equal(sum(unrec.rows.map((r) => r.order_total)), unrec.total);

  // paid amounts come from payment rows that ALSO exceed the cap inside a chunk
  const completedPaid = detail.rows.find((r) => r.order_status === "Completed" && r.payment_status === "Paid")!;
  assert.equal(completedPaid.paid_amount, PAYMENT_ROWS_FOR_COMPLETED_PAID * 100, "all 40 payment rows were read, none truncated");
  assert.equal(completedPaid.payment_count, PAYMENT_ROWS_FOR_COMPLETED_PAID);
});

// ---------------------------------------------------------------------------
// 2. Purchase loader (> 1000 purchases)
// ---------------------------------------------------------------------------
test("PURCHASE loader (> 1000 rows): Dashboard figure and recognized-revenue drill-down are COMPLETE and identical; BR-002 legacy rows all present", async () => {
  const { data, expect: e } = buildBig();
  const stats = newFakeStats();

  const dash = await getPurchaseReportData(RANGE, client(data, stats), null);
  const detail = await getRecognizedRevenueDetail(RANGE, client(data, stats), null);

  assert.equal(dash.totalRevenue, e.recognizedPurchasesValue);
  assert.equal(dash.legacyRecognizedRevenue, e.legacyInRangeValue);
  assert.equal(detail.total, e.recognizedPurchasesValue);
  assert.equal(detail.rows.length, e.recognizedPurchasesCount, "no recognized row lost");
  assert.equal(unique(detail.rows.map((r) => r.purchase_id ?? "")), detail.rows.length, "no recognized row duplicated");
  assert.equal(sum(detail.rows.map((r) => r.amount)), e.recognizedPurchasesValue);
  assert.equal(detail.rows.filter((r) => r.rule === "BR-002").length, e.legacyInRangeCount, "every legacy BR-002 row present");
  assert.equal(detail.legacyTotal, e.legacyInRangeValue);
  assert.ok(!detail.rows.some((r) => r.recognition_date >= "2026-10-01" || r.recognition_date < "2026-09-01"), "sale_date filter preserved");
});

test("PURCHASE cost lookup (enrichment): > 1000 distinct products are all priced - totalCost is complete, not truncated", async () => {
  const { data } = buildBig();
  const stats = newFakeStats();
  const dash = await getPurchaseReportData(RANGE, client(data, stats), null);
  // every recognized snapshot row has a distinct product with cost_price 10
  const recognizedWithProduct = data.purchases.filter((p) => {
    if (!p.order_item_id || p.sale_date >= "2026-10-01" || p.sale_date < "2026-09-01") return false;
    const item = data.orderItems.find((i) => i.id === p.order_item_id)!;
    const order = data.orders.find((o) => o.id === item.order_id)!;
    return order.order_status === "Completed" && order.payment_status === "Paid";
  }).length;
  assert.ok(recognizedWithProduct > 0);
  assert.equal(dash.totalCost, recognizedWithProduct * 10);
});

// ---------------------------------------------------------------------------
// 3 + 4. Sold order-line loader and legacy loader (> 1000 each)
// ---------------------------------------------------------------------------
test("SOLD loaders (> 1000 sold orders AND > 1000 legacy rows): totals, lines and both views are COMPLETE; the LOCKED Sold definition is unchanged", async () => {
  const { data, expect: e } = buildBig();
  const stats = newFakeStats();
  const staff = { id: "staff-1", full_name: "Test", role: "Owner", role_id: null } as never;

  const sold = await getSoldDetail({ page: 1, dateFrom: RANGE.start, dateTo: RANGE.end }, client(data, stats), staff);

  assert.equal(sold.products.length, e.soldLines, "no sold line lost");
  assert.equal(unique(sold.products.map((p) => p.line_key)), sold.products.length, "no sold line duplicated");
  assert.equal(sold.totals.soldValue, e.soldValue);
  assert.equal(sum(sold.products.map((p) => p.final_sale_price)), e.soldValue);
  assert.equal(sum(sold.orders.map((o) => o.sold_value)), e.soldValue);
  assert.equal(sold.orders.length, e.soldOrderCount + e.legacyInRangeCount, "one row per sold order + one per legacy entry");
  assert.equal(sold.totals.recognizedRevenue, e.soldRecognizedValue);
  assert.equal(sold.totals.soldValue, sold.totals.recognizedRevenue + sold.totals.unrecognizedValue);
  assert.equal(sold.products.filter((p) => p.is_legacy).length, e.legacyInRangeCount, "every legacy line present");

  // definition unchanged: Draft / Reserved-without-payment / Lost never appear; Reserved-with-payment does
  const status = (s: string, pay?: string) => sold.products.filter((p) => p.order_status === s && (pay === undefined || p.payment_status === pay)).length;
  assert.equal(status("Draft"), 0);
  assert.equal(status("Lost"), 0);
  assert.equal(status("Reserved", "Unpaid"), 0, "Reserved without a payment row is not Sold");
  assert.equal(status("Reserved", "Partially Paid"), N / 6, "Reserved WITH a payment row is Sold");
  assert.equal(status("Completed"), N / 3);

  // paid amount per order comes from payment rows that exceed the cap within a chunk
  const paidOrder = sold.orders.find((o) => o.order_status === "Completed" && o.payment_status === "Paid")!;
  assert.equal(paidOrder.amount_paid, PAYMENT_ROWS_FOR_COMPLETED_PAID * 100);
});

test("SOLD legacy loader alone (> 1000): with no orders in range, all 1,200 BR-002 entries are still returned", async () => {
  const { data, expect: e } = buildBig();
  data.orders = [];
  data.orderItems = [];
  data.purchases = data.purchases.filter((p) => p.order_item_id === null);
  const staff = { id: "staff-1", full_name: "Test", role: "Owner", role_id: null } as never;
  const sold = await getSoldDetail({ page: 1, dateFrom: RANGE.start, dateTo: RANGE.end }, client(data), staff);
  assert.equal(sold.products.length, e.legacyInRangeCount);
  assert.equal(sold.totals.soldValue, e.legacyInRangeValue);
  assert.equal(unique(sold.products.map((p) => p.line_key)), e.legacyInRangeCount);
});

// ---------------------------------------------------------------------------
// Whole Overview agrees with itself AND with the independent expectation
// ---------------------------------------------------------------------------
test("OVERVIEW on the big dataset: every range-based metric equals the independently computed expectation (not merely its own drill-down)", async () => {
  const { data, expect: e } = buildBig();
  const { metrics } = await getOverviewMetrics(RANGE, client(data), null);
  assert.equal(metrics.totalOrderValue.value, e.nonLostValue);
  assert.equal(metrics.totalOrderValue.orderCount, e.nonLostCount);
  assert.equal(metrics.recognizedRevenue.value, e.recognizedPurchasesValue);
  assert.equal(metrics.unrecognizedValue.value, e.nonLostValue - e.completedPaidOrderValue);
  assert.equal(metrics.sold!.value, e.soldValue);
  assert.equal(metrics.sold!.lineCount, e.soldLines);
});

// ---------------------------------------------------------------------------
// Paging mechanics: ordered, ranged, sequential, robust to a lower server cap / missing count
// ---------------------------------------------------------------------------
test("EVERY reporting read is ordered by the unique `id` key and ranged; page counts are as expected (sequential requests)", async () => {
  const { data } = buildBig();
  const stats = newFakeStats();
  await getOverviewMetrics(RANGE, client(data, stats), null);
  await getOrderValueDetail(RANGE, undefined, client(data, stats));

  assert.ok(stats.requests.length > 0);
  assert.ok(
    stats.requests.every((r) => r.ordered === "id" && r.range !== null),
    "no request was unordered or unranged - an unpaged read is what truncates"
  );
  const byTable = (t: string) => stats.requests.filter((r) => r.table === t);
  // orders loader: 2,400 + 150 rows -> the in-range filter leaves 2,000 non-Lost = 2 pages of <=1000 (+ the sold candidates)
  assert.ok(byTable("orders").some((r) => r.range![0] >= 1000), "the orders loader fetched a second page");
  assert.ok(byTable("customer_purchases").some((r) => r.range![0] >= 1000), "the purchase/legacy loader fetched a second page");
  assert.ok(byTable("payments").some((r) => r.range![0] >= 1000), "payments paged INSIDE a chunk (chunk owns > 1000 rows)");
  // first page of each chunk asks for the exact count, later pages do not
  assert.ok(stats.requests.filter((r) => r.range![0] === 0).every((r) => r.count), "count requested on the first page");
  assert.ok(stats.requests.filter((r) => r.range![0] > 0).every((r) => !r.count), "no repeated COUNT on later pages");
  console.log(
    "# page counts (overview + order detail on the big dataset): " +
      ["orders", "order_items", "customer_purchases", "payments", "products"].map((t) => `${t}=${byTable(t).length}`).join(" ") +
      ` total=${stats.requests.length} (all sequential awaits; no concurrency added)`
  );
});

test("a server cap LOWER than the page size (max-rows = 500) cannot create gaps: paging strides by rows actually received", async () => {
  const { data, expect: e } = buildBig();
  const stats = newFakeStats(500);
  const summary = await getOrderValueSummary(RANGE, undefined, client(data, stats));
  assert.equal(summary.totalOrderCount, e.nonLostCount);
  assert.equal(summary.totalOrderValue, e.nonLostValue);
  const detail = await getRecognizedRevenueDetail(RANGE, client(data, stats), null);
  assert.equal(detail.rows.length, e.recognizedPurchasesCount);
  assert.equal(detail.total, e.recognizedPurchasesValue);
  assert.equal(unique(detail.rows.map((r) => r.purchase_id ?? "")), detail.rows.length);
});

test("if the server never returns a count, paging continues until an EMPTY page instead of guessing from a short page", async () => {
  const { data, expect: e } = buildBig();
  const stats = newFakeStats(500, { omitCount: true });
  const summary = await getOrderValueSummary(RANGE, undefined, client(data, stats));
  assert.equal(summary.totalOrderCount, e.nonLostCount, "complete even with max-rows=500 AND no count header");
  assert.equal(summary.totalOrderValue, e.nonLostValue);
  assert.ok(stats.requests.at(-1)!.returned === 0, "terminated on an empty page");
});

test("fetchAllRows: a failed page is reported as an error (never returns a silently partial result)", async () => {
  let call = 0;
  const failing = {
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        range: () => b,
        then: (ok: (v: unknown) => unknown) => {
          call += 1;
          const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
          return Promise.resolve(call === 1 ? { data: rows, error: null, count: 1500 } : { data: null, error: { message: "boom" }, count: null }).then(ok);
        },
      };
      return b;
    },
  } as never;
  const result = await fetchAllRows(failing, "t", "id", (q) => ({ query: q }));
  assert.equal(result.data, null, "no partial data");
  assert.ok(result.error);
  assert.equal(result.pages, 2);
});

// ---------------------------------------------------------------------------
// Inventory: totals were already paged; DETAIL / enrichment must be too (Phase 1.2 item 6)
// ---------------------------------------------------------------------------
function buildInventoryBig() {
  const HELD = 1700;
  const AVAILABLE = 2300;
  const products: FakeInventoryProduct[] = [];
  const orders: FakeOrder[] = [];
  const orderItems: FakeOrderItem[] = [];
  const payments: { id: string; order_id: string; amount: number; payment_method: string }[] = [];

  orders.push({ id: "HIST", order_number: "ORD-HIST", order_status: "Completed", payment_status: "Paid", order_date: "2026-01-01", total_amount: 1, customer_id: "c1", sales_owner: "A", customer: CUSTOMER });
  let soldOverlap = 0;
  for (let i = 0; i < HELD; i++) {
    const pid = `HP${pad(i)}`;
    products.push({ id: pid, product_code: `H${pad(i)}`, product_name: `Held ${i}`, category: "Vòng tay", status: "Reserved", sale_price: 10, batch_id: null, salesperson: "A" });
    const oid = `OPEN${pad(i)}`;
    const reserved = i % 2 === 0;
    const hasPayment = reserved && i % 4 === 0;
    orders.push({ id: oid, order_number: `ORD-${oid}`, order_status: reserved ? "Reserved" : "Draft", payment_status: hasPayment ? "Partially Paid" : "Unpaid", order_date: "2026-09-10", total_amount: 100, customer_id: "c1", sales_owner: "A", customer: CUSTOMER });
    if (hasPayment) {
      payments.push({ id: `PAY${pad(i)}`, order_id: oid, amount: 50, payment_method: "Tiền mặt" });
      soldOverlap += 1;
    }
    // 5 history links to a Completed order + 1 live link: a chunk of 200 products owns 1,200 links > the cap
    for (let k = 0; k < 5; k++) orderItems.push({ id: `HI${pad(i)}-${k}`, order_id: "HIST", product_id: pid, snapshot_sale_price: 1, discount: 0, quantity: 1, product: null });
    orderItems.push({ id: `LI${pad(i)}`, order_id: oid, product_id: pid, snapshot_sale_price: 100, discount: 0, quantity: 1, product: null });
  }
  for (let i = 0; i < AVAILABLE; i++) {
    products.push({ id: `AP${pad(i)}`, product_code: `A${pad(i)}`, product_name: `Avail ${i}`, category: i % 2 ? "Nhẫn" : "Vòng tay", status: "Available", sale_price: 10, batch_id: null, salesperson: "A" });
  }
  for (let i = 0; i < 300; i++) products.push({ id: `SP${pad(i)}`, product_code: `S${pad(i)}`, product_name: `Sold ${i}`, category: "Vòng tay", status: "Sold", sale_price: 999, batch_id: null, salesperson: "A" });

  const data: OverviewFakeData = { orders: shuffle(orders, 5), orderItems: shuffle(orderItems, 6), purchases: [], payments: shuffle(payments, 7) as never, products: shuffle(products, 8) };
  return { data, HELD, AVAILABLE, soldOverlap };
}

test("INVENTORY enrichment (> 1000 held products, > 1000 order links per chunk): every product is linked to its OPEN order; nothing silently truncated", async () => {
  const { data, HELD, AVAILABLE, soldOverlap } = buildInventoryBig();
  const stats = newFakeStats();

  const held = await getHeldInventoryDetail(client(data, stats));
  assert.equal(held.rows.length, HELD);
  assert.equal(held.count, HELD);
  assert.equal(held.total, HELD * 10);
  assert.equal(unique(held.rows.map((r) => r.product_id)), HELD, "no duplicates");
  assert.equal(held.unlinkedCount, 0, "a truncated link read would leave products without their order");
  assert.ok(held.rows.every((r) => r.holding_order && r.holding_order.order_id === `OPEN${r.product_id.slice(2)}`), "each product is tied to ITS open order, not a history order");
  assert.equal(held.rows.filter((r) => r.also_counted_as_sold).length, soldOverlap, "Reserved + payment overlap flagged on every one of them");
  assert.ok(held.rows.filter((r) => r.also_counted_as_sold).every((r) => r.holding_order!.payment_count === 1 && r.holding_order!.order_status === "Reserved"));
  assert.ok(stats.requests.filter((r) => r.table === "order_items").some((r) => r.range![0] >= 1000), "order_items paged inside a chunk");

  const remaining = await getRemainingInventoryDetail(client(data, stats));
  assert.equal(remaining.rows.length, AVAILABLE);
  assert.equal(remaining.total, AVAILABLE * 10);
  assert.equal(unique(remaining.rows.map((r) => r.product_id)), AVAILABLE);
  assert.ok(remaining.rows.every((r) => r.status === "Available"));
  console.log(`# inventory pages: products=${stats.requests.filter((r) => r.table === "products").length} order_items=${stats.requests.filter((r) => r.table === "order_items").length} payments=${stats.requests.filter((r) => r.table === "payments").length}`);
});
