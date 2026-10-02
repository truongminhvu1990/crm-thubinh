import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { makeOverviewFakeClient, makeOverviewScenario } from "@/lib/reports/fakeOverviewClient.testutil";

/**
 * Phase 1 - Reporting Foundation: the six drill-down endpoints under
 * /api/reports/overview/*.
 *
 * The services are the REAL ones, reading a fake Supabase client (only auth,
 * the client, data-scope plumbing, Operating Expenses and the commission lookup
 * are faked). That lets this file assert the thing the Product Owner asked for
 * at the API boundary: the total each endpoint returns is the Overview metric
 * for the same query string. Routes must stay thin - they authenticate, parse
 * the shared date/filter context, and call a canonical service.
 */

let authorized = true;
const permissionKeys: string[] = [];
const fakeStaff = { id: "staff-1", full_name: "Test Staff", role: "Owner", role_id: null };

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
mock.module("@/lib/permission/serverAuth", {
  namedExports: {
    requirePermission: async (_request: NextRequest, key: string) => {
      permissionKeys.push(key);
      if (!authorized) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      return { staff: fakeStaff };
    },
    getCurrentStaffFromRequest: async () => fakeStaff,
  },
});
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => makeOverviewFakeClient(makeOverviewScenario()) } });

type Handler = (request: NextRequest) => Promise<Response>;
const handlers: Record<string, Handler> = {};
const ROUTES = ["order-value", "recognized-revenue", "unrecognized", "sold", "held-inventory", "remaining-inventory"] as const;

let getOverviewMetrics: typeof import("@/lib/reports/overviewMetrics.service").getOverviewMetrics;

before(async () => {
  handlers["order-value"] = (await import("./order-value/route")).GET;
  handlers["recognized-revenue"] = (await import("./recognized-revenue/route")).GET;
  handlers["unrecognized"] = (await import("./unrecognized/route")).GET;
  handlers["sold"] = (await import("./sold/route")).GET;
  handlers["held-inventory"] = (await import("./held-inventory/route")).GET;
  handlers["remaining-inventory"] = (await import("./remaining-inventory/route")).GET;
  ({ getOverviewMetrics } = await import("@/lib/reports/overviewMetrics.service"));
});

const url = (route: string, query = "") => new NextRequest(`http://localhost/api/reports/overview/${route}${query}`);
const SEPT = "?start=2026-09-01&end=2026-10-01";

async function call(route: string, query = "") {
  const res = await handlers[route](url(route, query));
  return { status: res.status, body: await res.json() };
}

test("every endpoint is gated by reports.view and returns 403 without it", async () => {
  for (const route of ROUTES) {
    authorized = false;
    permissionKeys.length = 0;
    const { status } = await call(route, SEPT);
    assert.equal(status, 403, `${route} must reject an unauthorized caller`);
    assert.deepEqual(permissionKeys, ["reports.view"], `${route} checks reports.view`);
  }
  authorized = true;
});

test("API == Dashboard: each endpoint's total equals the Overview metric for the same start/end", async () => {
  authorized = true;
  const { metrics } = await getOverviewMetrics({ start: "2026-09-01", end: "2026-10-01" }, makeOverviewFakeClient(makeOverviewScenario()) as never, null);

  const expected: Record<(typeof ROUTES)[number], { metric: string; total: number; count: number }> = {
    "order-value": { metric: "total_order_value", total: metrics.totalOrderValue.value, count: metrics.totalOrderValue.orderCount },
    "recognized-revenue": { metric: "recognized_revenue", total: metrics.recognizedRevenue.value, count: 4 },
    unrecognized: { metric: "unrecognized_value", total: metrics.unrecognizedValue.value, count: metrics.unrecognizedValue.orderCount },
    sold: { metric: "sold", total: metrics.sold!.value, count: metrics.sold!.orderCount },
    "held-inventory": { metric: "held_inventory", total: metrics.held!.value, count: metrics.held!.count },
    "remaining-inventory": { metric: "remaining_inventory", total: metrics.remaining!.value, count: metrics.remaining!.count },
  };

  for (const route of ROUTES) {
    const { status, body } = await call(route, SEPT);
    assert.equal(status, 200, route);
    assert.equal(body.metric, expected[route].metric, `${route}: metric id`);
    assert.equal(body.total, expected[route].total, `${route}: total reconciles to the Overview metric`);
    assert.equal(body.count, expected[route].count, `${route}: count`);
    assert.ok(Array.isArray(body.rows), `${route}: rows`);
    assert.equal(body.rows.length, expected[route].count, `${route}: one row per counted item`);
  }
});

test("the date context is echoed back so the destination can show \"Đang xem dữ liệu\": range for period metrics, null for current-state inventory", async () => {
  for (const route of ["order-value", "recognized-revenue", "unrecognized", "sold"]) {
    const { body } = await call(route, SEPT);
    assert.deepEqual(body.range, { start: "2026-09-01", end: "2026-10-01" }, route);
  }
  for (const route of ["held-inventory", "remaining-inventory"]) {
    assert.equal((await call(route, SEPT)).body.range, null, `${route}: a hold is current state, not a period`);
  }
  assert.equal((await call("order-value")).body.range, null, "no start/end = all time, as on the Dashboard");
});

test("a half-specified, malformed or inverted range is rejected with 400 - never silently widened to all-time", async () => {
  for (const route of ["order-value", "recognized-revenue", "unrecognized", "sold"]) {
    for (const query of ["?start=2026-09-01", "?end=2026-10-01", "?start=2026-9-1&end=2026-10-01", "?start=2026-02-30&end=2026-03-01", "?start=2026-10-01&end=2026-09-01", "?start=2026-09-01&end=2026-09-01"]) {
      const { status } = await call(route, query);
      assert.equal(status, 400, `${route}${query}`);
    }
  }
});

test("sold: view=orders (default) and view=products describe the same population; an unknown view is a 400", async () => {
  const orders = await call("sold", `${SEPT}&view=orders`);
  const products = await call("sold", `${SEPT}&view=products`);
  const fallback = await call("sold", SEPT);

  assert.equal(orders.body.view, "orders");
  assert.equal(products.body.view, "products");
  assert.equal(fallback.body.view, "orders");
  assert.equal(orders.body.total, products.body.total, "the same Sold total whichever view is shown");
  assert.equal(orders.body.totals.soldValue, products.body.totals.soldValue);
  assert.equal(orders.body.rows.length, 5, "O1, O2, O3, O4 + the legacy entry");
  assert.equal(products.body.rows.length, 6, "O2 has two product lines");
  assert.equal((await call("sold", `${SEPT}&view=bogus`)).status, 400);
});

test("sold: the report's own filters are forwarded (customer narrows the same population in both the total and the rows)", async () => {
  const { body } = await call("sold", `${SEPT}&view=products&customer=${encodeURIComponent("Khách 2")}`);
  assert.equal(body.rows.length, 2, "O2's two lines");
  assert.equal(body.total, 60);
});

test("inventory endpoints forward the shared filters (category) and keep total == sum of rows", async () => {
  const { body } = await call("remaining-inventory", `?category=${encodeURIComponent("Vòng tay")}`);
  assert.deepEqual([body.count, body.total], [2, 150]);
  assert.equal(body.rows.reduce((s: number, r: { sale_price: number | null }) => s + (r.sale_price ?? 0), 0), body.total);
});
