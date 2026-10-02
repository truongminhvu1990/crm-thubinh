import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import {
  getUnrecognizedReason,
  isOrderRecognized,
  isPurchaseRecognized,
  isSoldOrder,
  purchaseRecognitionRule,
} from "./revenueDefinition";
import { makeOverviewFakeClient, OverviewFakeData } from "./fakeOverviewClient.testutil";
import type { FakeOrder, FakeOrderItem, FakePurchase } from "@/lib/monthlySoldProducts/fakeReportingClient.testutil";

/**
 * Phase 1 - Reporting Foundation: OLD-vs-NEW regression for the revenue
 * recognition consolidation.
 *
 * `legacyPurchaseRecognized` below is the VERBATIM body of the private
 * `isRevenueRecognized` that lib/reports/reports.service.ts contained before
 * this phase (frozen here as the reference); `legacyOrderRecognized` is the
 * verbatim `isRecognizedRevenue` of businessIntelligence.service.ts, the
 * order-level form of the same rule. The shared definitions must return the
 * IDENTICAL answer for every combination - BR-001 and BR-002 (both LOCKED)
 * semantics are not allowed to move.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeWithFallback: async (q: unknown) => ({ query: q }),
    applyDataScopeByName: async (q: unknown) => ({ query: q }),
  },
});

type OrderRef = { order_status: string; payment_status: string };
type PurchaseLike = { order_item_id: string | null; order_items: { orders: OrderRef | null } | null };

// ---- frozen reference implementations (pre-Phase-1, verbatim) --------------
function legacyPurchaseRecognized(row: PurchaseLike): boolean {
  if (!row.order_item_id) return true;
  const order = row.order_items?.orders;
  return order?.order_status === "Completed" && order?.payment_status === "Paid";
}
function legacyOrderRecognized(order: OrderRef): boolean {
  return order.order_status === "Completed" && order.payment_status === "Paid";
}
// ----------------------------------------------------------------------------

const ORDER_STATUSES = ["Draft", "Reserved", "Completed", "Lost", "Cancelled", "", "completed"];
// "Partially Paid" is the live value (PAYMENT_STATUS); "PartiallyPaid" is what
// several fixtures use - both must behave identically (neither is recognized).
const PAYMENT_STATUSES = ["Unpaid", "Partially Paid", "PartiallyPaid", "Paid", "", "paid"];

function purchaseCases(): { name: string; row: PurchaseLike }[] {
  const cases: { name: string; row: PurchaseLike }[] = [
    { name: "legacy: no order_item_id, no embed (BR-002)", row: { order_item_id: null, order_items: null } },
    {
      name: "legacy: no order_item_id even though an embed is present",
      row: { order_item_id: null, order_items: { orders: { order_status: "Draft", payment_status: "Unpaid" } } },
    },
    { name: "linked, order_items embed missing", row: { order_item_id: "i1", order_items: null } },
    { name: "linked, orders join found nothing", row: { order_item_id: "i1", order_items: { orders: null } } },
  ];
  for (const order_status of ORDER_STATUSES) {
    for (const payment_status of PAYMENT_STATUSES) {
      cases.push({
        name: `linked: ${order_status || "<empty>"} / ${payment_status || "<empty>"}`,
        row: { order_item_id: "i1", order_items: { orders: { order_status, payment_status } } },
      });
    }
  }
  return cases;
}

test("OLD == NEW for isPurchaseRecognized across every linkage / order status / payment status combination (BR-001 + BR-002)", () => {
  const cases = purchaseCases();
  assert.ok(cases.length > 40, "the matrix is genuinely exhaustive");
  for (const { name, row } of cases) {
    assert.equal(isPurchaseRecognized(row), legacyPurchaseRecognized(row), `diverged on: ${name}`);
  }
});

test("OLD == NEW for isOrderRecognized (order-level BR-001) across every order status / payment status combination", () => {
  for (const order_status of ORDER_STATUSES) {
    for (const payment_status of PAYMENT_STATUSES) {
      const o = { order_status, payment_status };
      assert.equal(isOrderRecognized(o), legacyOrderRecognized(o), `diverged on: ${order_status} / ${payment_status}`);
    }
  }
});

test("the named business cases, spelled out: recognized? rule? sold? reason?", () => {
  // [label, row, paymentCount, recognized, rule, sold, reasonCode]
  const o = (order_status: string, payment_status: string): PurchaseLike => ({
    order_item_id: "i1",
    order_items: { orders: { order_status, payment_status } },
  });
  const table: [string, PurchaseLike | null, OrderRef | null, number, boolean, string | null, boolean, string | null][] = [
    ["BR-001 recognized (Completed + Paid)", o("Completed", "Paid"), { order_status: "Completed", payment_status: "Paid" }, 1, true, "BR-001", true, null],
    ["BR-001 not recognized (Completed, no payment status Paid)", o("Completed", "Unpaid"), { order_status: "Completed", payment_status: "Unpaid" }, 0, false, null, true, "ORDER_NOT_FULLY_PAID"],
    ["BR-002 legacy recognized (no order link)", { order_item_id: null, order_items: null }, null, 0, true, "BR-002", false, null],
    ["Completed unpaid", o("Completed", "Unpaid"), { order_status: "Completed", payment_status: "Unpaid" }, 0, false, null, true, "ORDER_NOT_FULLY_PAID"],
    ["Completed partially paid", o("Completed", "Partially Paid"), { order_status: "Completed", payment_status: "Partially Paid" }, 1, false, null, true, "ORDER_NOT_FULLY_PAID"],
    ["Draft", o("Draft", "Unpaid"), { order_status: "Draft", payment_status: "Unpaid" }, 0, false, null, false, "ORDER_DRAFT"],
    ["Reserved unpaid", o("Reserved", "Unpaid"), { order_status: "Reserved", payment_status: "Unpaid" }, 0, false, null, false, "ORDER_RESERVED"],
    ["Reserved with payment", o("Reserved", "Partially Paid"), { order_status: "Reserved", payment_status: "Partially Paid" }, 1, false, null, true, "ORDER_RESERVED"],
    ["Lost", o("Lost", "Paid"), { order_status: "Lost", payment_status: "Paid" }, 1, false, null, false, "ORDER_LOST"],
  ];

  for (const [label, purchase, order, paymentCount, recognized, rule, sold, reasonCode] of table) {
    if (purchase) {
      assert.equal(isPurchaseRecognized(purchase), recognized, `${label}: recognized`);
      assert.equal(purchaseRecognitionRule(purchase), rule, `${label}: rule`);
      assert.equal(legacyPurchaseRecognized(purchase), recognized, `${label}: matches the frozen old implementation`);
    }
    if (order) {
      assert.equal(isOrderRecognized(order), recognized && rule !== "BR-002", `${label}: order-level BR-001`);
      assert.equal(isSoldOrder(order, paymentCount), sold, `${label}: sold`);
      // Lost orders are excluded by every loader's query, so no dataset row ever
      // carries this; the helper still answers accurately rather than throwing.
      assert.equal(getUnrecognizedReason(order, paymentCount)?.code ?? null, recognized && rule !== "BR-002" ? null : reasonCode, `${label}: reason`);
    }
  }
});

// ---- end to end: the Dashboard figure, old arithmetic vs new ----------------

function matrixFixture(): { data: OverviewFakeData; rows: PurchaseLike[] } {
  const orders: FakeOrder[] = [];
  const orderItems: FakeOrderItem[] = [];
  const purchases: FakePurchase[] = [];
  const rows: PurchaseLike[] = [];
  let n = 0;
  const cust = { full_name: "Khách M", customer_code: "KHM" };

  for (const order_status of ["Draft", "Reserved", "Completed", "Lost"]) {
    for (const payment_status of ["Unpaid", "Partially Paid", "Paid"]) {
      n += 1;
      const orderId = `MO${n}`;
      const itemId = `MI${n}`;
      orders.push({
        id: orderId, order_number: `M-${n}`, order_status, payment_status, order_date: "2026-09-10",
        total_amount: 1000 * n, customer_id: "cm", sales_owner: "Nhân viên A", customer: cust,
      });
      orderItems.push({ id: itemId, order_id: orderId, product_id: null, snapshot_sale_price: 1000 * n, discount: 0, quantity: 1, product: null });
      purchases.push({
        id: `MP${n}`, order_item_id: itemId, customer_id: "cm", product_id: null, sale_price: 1000 * n, sale_date: "2026-09-10",
        salesperson: "Nhân viên A", salesperson_id: null, customer: cust, product: null,
      });
      rows.push({ order_item_id: itemId, order_items: { orders: { order_status, payment_status } } });
    }
  }
  for (const [i, amount] of [111, 222].entries()) {
    purchases.push({
      id: `ML${i}`, order_item_id: null, customer_id: "cm", product_id: null, sale_price: amount, sale_date: "2026-09-12",
      salesperson: "Nhân viên A", salesperson_id: null, customer: cust, product: null,
    });
    rows.push({ order_item_id: null, order_items: null });
  }
  return { data: { orders, orderItems, purchases, payments: [], products: [] }, rows };
}

let reports: typeof import("./reports.service");

before(async () => {
  reports = await import("./reports.service");
});

test("END TO END: getPurchaseReportData totals == the old arithmetic (frozen reference loop) over the full status matrix, BR-002 legacy rows included", async () => {
  const { data, rows } = matrixFixture();
  const range = { start: "2026-09-01", end: "2026-10-01" };

  // Reference: the pre-Phase-1 accumulation, verbatim.
  let oldTotal = 0;
  let oldLegacy = 0;
  data.purchases.forEach((p, i) => {
    const recognized = legacyPurchaseRecognized(rows[i]);
    const price = recognized ? Number(p.sale_price) || 0 : 0;
    oldTotal += price;
    if (!p.order_item_id) oldLegacy += price;
  });
  assert.ok(oldTotal > 0 && oldLegacy === 333, "fixture sanity: some recognized revenue and two legacy rows");

  const client = makeOverviewFakeClient(data) as never;
  const purchases = await reports.getPurchaseReportData(range, client, null);
  const detail = await reports.getRecognizedRevenueDetail(range, client, null);

  assert.equal(purchases.totalRevenue, oldTotal);
  assert.equal(purchases.legacyRecognizedRevenue, oldLegacy);
  assert.equal(detail.total, oldTotal, "the drill-down total is the same figure");
  assert.equal(detail.legacyTotal, oldLegacy);
  assert.equal(detail.linkedTotal, oldTotal - oldLegacy);
  assert.equal(detail.rows.reduce((s, r) => s + r.amount, 0), oldTotal, "rows sum to the total");
  assert.equal(detail.count, detail.rows.length);
});
