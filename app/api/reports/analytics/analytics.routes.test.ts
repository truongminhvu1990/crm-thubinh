import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { makeOverviewFakeClient, makeOverviewScenario } from "@/lib/reports/fakeOverviewClient.testutil";

/**
 * Dashboard biểu đồ Wave A: /api/reports/analytics/{trend,comparison}.
 * Real services over the fake Supabase client. Asserts at the API boundary that (1) reports.view gates both, (2) every trend's total equals
 * the Overview KPI for the same range, (3) the 5 granularities never change that total, (4) gross profit / cost are refused or absent for
 * every role except Owner/Manager - on the server, (5) the previous period is the filter's own definition.
 */

let authorized = true;
let role = "Owner";
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
  namedExports: { resolveRoleForStaff: async () => ({ role_key: role, is_active: true }) },
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

let trend: (r: NextRequest) => Promise<Response>;
let comparison: (r: NextRequest) => Promise<Response>;
let getOverviewMetrics: typeof import("@/lib/reports/overviewMetrics.service").getOverviewMetrics;

before(async () => {
  trend = (await import("./trend/route")).GET;
  comparison = (await import("./comparison/route")).GET;
  ({ getOverviewMetrics } = await import("@/lib/reports/overviewMetrics.service"));
});

const SEPT = "start=2026-09-01&end=2026-10-01";
const get = async (h: (r: NextRequest) => Promise<Response>, path: string, q: string) => {
  const res = await h(new NextRequest(`http://localhost/api/reports/analytics/${path}?${q}`));
  return { status: res.status, body: await res.json() };
};

test("both endpoints require reports.view", async () => {
  authorized = false;
  permissionKeys.length = 0;
  assert.equal((await get(trend, "trend", `metric=sold&granularity=day&${SEPT}`)).status, 403);
  assert.equal((await get(comparison, "comparison", `option=last_month&${SEPT}`)).status, 403);
  assert.deepEqual(permissionKeys, ["reports.view", "reports.view"]);
  authorized = true;
});

test("trend total == Overview KPI for every metric, and every granularity keeps it", async () => {
  role = "Owner";
  const range = { start: "2026-09-01", end: "2026-10-01" };
  const { metrics, purchases } = await getOverviewMetrics(range, makeOverviewFakeClient(makeOverviewScenario()) as never, null);
  const expected = {
    totalOrderValue: metrics.totalOrderValue.value,
    sold: metrics.sold!.value,
    recognizedRevenue: metrics.recognizedRevenue.value,
    grossProfit: purchases.totalProfit,
  } as const;
  for (const metric of Object.keys(expected) as (keyof typeof expected)[]) {
    for (const g of ["day", "week", "month", "quarter", "year"]) {
      const { status, body } = await get(trend, "trend", `metric=${metric}&granularity=${g}&${SEPT}`);
      assert.equal(status, 200, `${metric}/${g}`);
      assert.equal(body.total, expected[metric], `${metric}/${g}: total reconciles to the KPI`);
      const sum = body.points.reduce((s: number, p: { value: number }) => s + p.value, 0) + body.excluded.value;
      assert.equal(sum, body.total, `${metric}/${g}: buckets + excluded == total`);
    }
  }
});

test("fixture is non-trivial", async () => {
  role = "Owner";
  for (const m of ["totalOrderValue","sold","recognizedRevenue","grossProfit"]) {
    const b = (await get(trend, "trend", `metric=${m}&granularity=week&${SEPT}`)).body;
    assert.ok(b.total !== 0 && b.points.some((p: {value:number}) => p.value !== 0), `${m} must have data in the fixture`);
  }
});

test("date basis: order metrics by order_date, recognized revenue / profit by sale_date", async () => {
  const basis = async (metric: string) => (await get(trend, "trend", `metric=${metric}&granularity=month&${SEPT}`)).body.dateBasis;
  assert.equal(await basis("totalOrderValue"), "order_date");
  assert.equal(await basis("sold"), "order_date");
  assert.equal(await basis("recognizedRevenue"), "sale_date");
  assert.equal(await basis("grossProfit"), "sale_date");
});

test("gross profit is refused (403) for every role except Owner/Manager; no cost/profit leaves the comparison API for them", async () => {
  for (const r of ["Owner", "Manager"]) {
    role = r;
    assert.equal((await get(trend, "trend", `metric=grossProfit&granularity=month&${SEPT}`)).status, 200, r);
    const c = (await get(comparison, "comparison", `option=last_month&${SEPT}`)).body;
    assert.equal(c.canViewCostAndProfit, true, r);
    assert.equal(typeof c.current.grossProfit, "number", r);
    assert.equal(typeof c.current.cost, "number", r);
  }
  for (const r of ["Sales", "Marketing", "Viewer"]) {
    role = r;
    assert.equal((await get(trend, "trend", `metric=grossProfit&granularity=month&${SEPT}`)).status, 403, r);
    // other metrics stay available
    assert.equal((await get(trend, "trend", `metric=recognizedRevenue&granularity=month&${SEPT}`)).status, 200, r);
    const c = (await get(comparison, "comparison", `option=last_month&${SEPT}`)).body;
    assert.equal(c.canViewCostAndProfit, false, r);
    assert.equal(c.current.grossProfit, null, r);
    assert.equal(c.current.cost, null, r);
    assert.equal(c.previous.grossProfit, null, r);
    assert.equal(c.comparison.grossProfit.delta, null, r);
    assert.ok(!JSON.stringify(c).match(/"(cost|grossProfit)":\s*-?\d/), `${r}: no cost/profit number anywhere in the payload`);
  }
  role = "Owner";
});

test("comparison: previous period is getPreviousEquivalentRange; delta/% follow the rules; all-time has no previous", async () => {
  role = "Owner";
  const c = (await get(comparison, "comparison", `option=last_month&${SEPT}`)).body;
  assert.deepEqual(c.previousRange, { start: "2026-08-01", end: "2026-09-01" });
  const { metrics } = await getOverviewMetrics(c.range, makeOverviewFakeClient(makeOverviewScenario()) as never, null);
  assert.equal(c.current.totalOrderValue, metrics.totalOrderValue.value);
  assert.equal(c.current.recognizedRevenue, metrics.recognizedRevenue.value);
  assert.equal(c.current.sold, metrics.sold!.value);
  const rev = c.comparison.recognizedRevenue;
  assert.equal(rev.delta, rev.current - rev.previous);
  if (rev.previous > 0) assert.equal(rev.percent, (rev.delta / rev.previous) * 100);
  else assert.equal(rev.percent, null);

  const all = (await get(comparison, "comparison", "option=all_time")).body;
  assert.equal(all.previousRange, null);
  assert.equal(all.previous, null);
  assert.equal(all.comparison, null);
});

test("bad input is a 400, never a silent default", async () => {
  assert.equal((await get(trend, "trend", `metric=nope&granularity=day&${SEPT}`)).status, 400);
  assert.equal((await get(trend, "trend", `metric=sold&granularity=hour&${SEPT}`)).status, 400);
  assert.equal((await get(trend, "trend", "metric=sold&granularity=day&start=2026-09-01")).status, 400);
  assert.equal((await get(comparison, "comparison", `option=bogus&${SEPT}`)).status, 400);
  assert.equal((await get(comparison, "comparison", `option=all_time&${SEPT}`)).status, 400);
  assert.equal((await get(comparison, "comparison", "option=last_month")).status, 400);
  assert.equal((await get(trend, "trend", "metric=sold&granularity=day&start=2000-01-01&end=2026-10-01")).status, 422);
});
