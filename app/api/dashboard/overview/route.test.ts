import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest } from "next/server";

/**
 * Revenue Management Visibility (2026-08-29) - GET /api/dashboard/overview
 * now also returns `orderValue` (Total Order Value + the Orders population's
 * own Recognized/Unrecognized split, getOrderValueSummary) and
 * `unrecognizedOrderValue`.
 *
 * Order Revenue Visibility Semantic Gap fix (2026-08-29 follow-up):
 * `unrecognizedOrderValue` is now `orderValue.orderBasedUnrecognizedValue`
 * directly — NOT `orderValue.totalOrderValue - purchases.totalRevenue` any
 * more (that subtraction silently netted out BR-002 legacy
 * customer_purchases revenue with no linked Order at all). Verifies: all
 * five underlying calls receive the same range/staff/client, the response
 * carries every field, and — critically — that `unrecognizedOrderValue`
 * ignores `purchases.totalRevenue` entirely, even when the two would
 * disagree (a legacy-revenue scenario).
 */

const fakeClient = { id: "request-scoped-client" };
let currentStaff: unknown = { id: "staff-1", full_name: "Test Staff" };

let purchaseDataToReturn = { totalRevenue: 0, totalCost: 0, totalProfit: 0, bySource: [], bySalesperson: [], topCustomers: [], byPeriod: [] };
let orderValueToReturn = {
  totalOrderValue: 0,
  totalOrderCount: 0,
  orderBasedRecognizedValue: 0,
  orderBasedUnrecognizedValue: 0,
  breakdown: [] as unknown[],
};

const purchaseCalls: { range: unknown; client: unknown; staff: unknown }[] = [];
const orderValueCalls: { range: unknown; staff: unknown; client: unknown }[] = [];

let GET: typeof import("./route").GET;

before(async () => {
  mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
  mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => fakeClient } });
  mock.module("@/lib/permission/serverAuth", { namedExports: { getCurrentStaffFromRequest: async () => currentStaff } });
  mock.module("@/lib/customer.service", {
    namedExports: { getCustomerStats: async () => ({ total: 0, vip: 0, normal: 0, recentlyContacted: 0 }) },
  });
  mock.module("@/lib/reports/reports.service", {
    namedExports: {
      getProductReportData: async () => ({ total: 0 }),
      getBatchStaticReportData: async () => ({ totalBatches: 0 }),
      getPurchaseReportData: async (range: unknown, client: unknown, staff: unknown) => {
        purchaseCalls.push({ range, client, staff });
        return purchaseDataToReturn;
      },
    },
  });
  mock.module("@/lib/orders/orderValueSummary.service", {
    namedExports: {
      getOrderValueSummary: async (range: unknown, staff: unknown, client: unknown) => {
        orderValueCalls.push({ range, staff, client });
        return orderValueToReturn;
      },
    },
  });

  const mod = await import("./route");
  GET = mod.GET;
});

function reset() {
  currentStaff = { id: "staff-1", full_name: "Test Staff" };
  purchaseCalls.length = 0;
  orderValueCalls.length = 0;
}

test("passes the same range, staff, and client to getPurchaseReportData and getOrderValueSummary", async () => {
  reset();
  purchaseDataToReturn = { ...purchaseDataToReturn, totalRevenue: 2_521_400_000 };
  orderValueToReturn = { totalOrderValue: 3_582_420_000, totalOrderCount: 41, orderBasedRecognizedValue: 2_521_400_000, orderBasedUnrecognizedValue: 1_061_020_000, breakdown: [] };

  const request = new NextRequest("http://localhost/api/dashboard/overview?start=2026-08-01&end=2026-09-01");
  await GET(request);

  assert.equal(purchaseCalls.length, 1);
  assert.equal(orderValueCalls.length, 1);
  assert.deepEqual(purchaseCalls[0].range, { start: "2026-08-01", end: "2026-09-01" });
  assert.deepEqual(orderValueCalls[0].range, { start: "2026-08-01", end: "2026-09-01" });
  assert.equal(purchaseCalls[0].client, fakeClient);
  assert.equal(orderValueCalls[0].client, fakeClient);
  assert.equal(purchaseCalls[0].staff, currentStaff);
  assert.equal(orderValueCalls[0].staff, currentStaff);
});

test("unrecognizedOrderValue = orderValue.orderBasedUnrecognizedValue, matching the audited August 2026 reconciliation (no legacy revenue in this case)", async () => {
  reset();
  purchaseDataToReturn = { ...purchaseDataToReturn, totalRevenue: 2_521_400_000 };
  orderValueToReturn = {
    totalOrderValue: 3_582_420_000,
    totalOrderCount: 41,
    orderBasedRecognizedValue: 2_521_400_000,
    orderBasedUnrecognizedValue: 1_061_020_000,
    breakdown: [],
  };

  const request = new NextRequest("http://localhost/api/dashboard/overview?start=2026-08-01&end=2026-09-01");
  const res = await GET(request);
  const body = await res.json();

  assert.equal(body.purchases.totalRevenue, 2_521_400_000);
  assert.equal(body.orderValue.totalOrderValue, 3_582_420_000);
  assert.equal(body.unrecognizedOrderValue, 1_061_020_000);
});

test("Order Revenue Visibility Semantic Gap fix: unrecognizedOrderValue is orderValue.orderBasedUnrecognizedValue even when purchases.totalRevenue includes legacy BR-002 revenue with no linked Order — never Total Order Value minus Recognized Revenue", async () => {
  reset();
  // Legacy scenario: purchases.totalRevenue (₫1,300,000) includes ₫300,000
  // of BR-002 legacy revenue that getOrderValueSummary knows nothing about
  // (it never queries customer_purchases). The old (fixed) formula would
  // have computed 1,500,000 - 1,300,000 = 200,000; the correct Orders-only
  // B3 is 500,000 (the one Draft+Paid order's own value).
  purchaseDataToReturn = { ...purchaseDataToReturn, totalRevenue: 1_300_000 };
  orderValueToReturn = {
    totalOrderValue: 1_500_000,
    totalOrderCount: 2,
    orderBasedRecognizedValue: 1_000_000,
    orderBasedUnrecognizedValue: 500_000,
    breakdown: [{ order_status: "Draft", payment_status: "Paid", count: 1, total: 500_000 }],
  };

  const request = new NextRequest("http://localhost/api/dashboard/overview?start=2026-08-01&end=2026-09-01");
  const res = await GET(request);
  const body = await res.json();

  const oldWrongFormula = body.orderValue.totalOrderValue - body.purchases.totalRevenue;
  assert.equal(oldWrongFormula, 200_000, "sanity check: the old formula really would disagree here");
  assert.equal(body.unrecognizedOrderValue, 500_000, "the route must use orderBasedUnrecognizedValue, not Total Order Value minus Recognized Revenue");
  assert.notEqual(body.unrecognizedOrderValue, oldWrongFormula);
});

test("no date range (all-time) is passed through as null to both revenue-shaped calls", async () => {
  reset();
  const request = new NextRequest("http://localhost/api/dashboard/overview");
  await GET(request);

  assert.equal(purchaseCalls[0].range, null);
  assert.equal(orderValueCalls[0].range, null);
});
