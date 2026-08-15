import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";

/**
 * Reporting API Permission Enforcement (docs/REPORTING_MASTER_SPEC.md §12,
 * LOCKED Rev 3) — Product Owner Implementation Directive, 2026-08-15.
 *
 * Covers the 13 routes the Production Readiness Audit found serving real
 * financial/customer/staff data with zero `reports.view` enforcement:
 * batches, batches/revenue, customers, products, purchases, and all 7
 * reports/bi/* routes. Same mocking approach already established for
 * Products' own route-level permission tests
 * (app/api/products/products.permissions.test.ts) — mock requirePermission
 * + createClient + every underlying service function, then invoke each
 * route handler directly with a constructed NextRequest. No real
 * Supabase/DB touched.
 */

let authorized = true;
const serviceCalls: { fn: string; args: unknown[] }[] = [];

before(() => {
  mock.module("@/lib/permission/serverAuth", {
    namedExports: {
      requirePermission: async (_request: NextRequest, permissionKey: string) => {
        if (!authorized) {
          return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
        }
        return { staff: { id: "staff-1", requestedPermission: permissionKey } };
      },
      getCurrentStaffFromRequest: async () => ({ id: "staff-1", full_name: "Test Staff" }),
    },
  });

  mock.module("@/lib/supabase/server", {
    namedExports: {
      createClient: async () => ({}),
    },
  });

  mock.module("@/lib/reports/reports.service", {
    namedExports: {
      getBatchStaticReportData: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getBatchStaticReportData", args });
        return { productCountByBatch: [], soldCountByBatch: [], remainingCountByBatch: [], overdueBatches: [] };
      },
      getRevenueByBatch: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getRevenueByBatch", args });
        return [];
      },
      getCustomerReportData: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getCustomerReportData", args });
        return { byVipLevel: [], byBirthdayMonth: [] };
      },
      getProductReportData: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getProductReportData", args });
        return { byCategory: [], byStatus: [] };
      },
      getPurchaseReportData: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getPurchaseReportData", args });
        return { bySource: [], bySalesperson: [], topCustomers: [], byPeriod: [] };
      },
    },
  });

  mock.module("@/lib/reports/reportsBI.service", {
    namedExports: {
      getKpiDashboard: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getKpiDashboard", args });
        return { kpis: [] };
      },
      getCategoryAnalysis: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getCategoryAnalysis", args });
        return [];
      },
      getCustomerSummary: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getCustomerSummary", args });
        return { newBuyers: 0, returningCustomers: 0 };
      },
      getRevenuePeriods: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getRevenuePeriods", args });
        return [];
      },
      getRevenueSummary: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getRevenueSummary", args });
        return { revenue: 0 };
      },
      getRevenueTrend: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getRevenueTrend", args });
        return [];
      },
      getStaffAnalysis: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getStaffAnalysis", args });
        return [];
      },
      getTopCustomers: async (...args: unknown[]) => {
        serviceCalls.push({ fn: "getTopCustomers", args });
        return [];
      },
    },
  });
});

beforeEach(() => {
  authorized = true;
  serviceCalls.length = 0;
});

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

interface RouteCase {
  label: string;
  modulePath: string;
  url: string;
  serviceFn: string;
}

const ROUTES: RouteCase[] = [
  { label: "1. batches", modulePath: "./batches/route", url: "/api/reports/batches", serviceFn: "getBatchStaticReportData" },
  { label: "2. batches/revenue", modulePath: "./batches/revenue/route", url: "/api/reports/batches/revenue", serviceFn: "getRevenueByBatch" },
  { label: "3. customers", modulePath: "./customers/route", url: "/api/reports/customers", serviceFn: "getCustomerReportData" },
  { label: "4. products", modulePath: "./products/route", url: "/api/reports/products", serviceFn: "getProductReportData" },
  { label: "5. purchases", modulePath: "./purchases/route", url: "/api/reports/purchases", serviceFn: "getPurchaseReportData" },
  { label: "6. bi/kpi", modulePath: "./bi/kpi/route", url: "/api/reports/bi/kpi", serviceFn: "getKpiDashboard" },
  { label: "7. bi/category-analysis", modulePath: "./bi/category-analysis/route", url: "/api/reports/bi/category-analysis", serviceFn: "getCategoryAnalysis" },
  { label: "8. bi/customer-summary", modulePath: "./bi/customer-summary/route", url: "/api/reports/bi/customer-summary", serviceFn: "getCustomerSummary" },
  { label: "9. bi/revenue-periods", modulePath: "./bi/revenue-periods/route", url: "/api/reports/bi/revenue-periods", serviceFn: "getRevenuePeriods" },
  { label: "10. bi/revenue-summary", modulePath: "./bi/revenue-summary/route", url: "/api/reports/bi/revenue-summary", serviceFn: "getRevenueSummary" },
  { label: "11. bi/revenue-trend", modulePath: "./bi/revenue-trend/route", url: "/api/reports/bi/revenue-trend", serviceFn: "getRevenueTrend" },
  { label: "12. bi/staff-analysis", modulePath: "./bi/staff-analysis/route", url: "/api/reports/bi/staff-analysis", serviceFn: "getStaffAnalysis" },
  { label: "13. bi/top-customers", modulePath: "./bi/top-customers/route", url: "/api/reports/bi/top-customers", serviceFn: "getTopCustomers" },
];

for (const route of ROUTES) {
  test(`${route.label}: authorized (reports.view) reaches ${route.serviceFn} and returns 200`, async () => {
    const { GET } = await import(route.modulePath);
    const res = await GET(makeRequest(route.url));
    assert.equal(res.status, 200);
    assert.ok(serviceCalls.some((c) => c.fn === route.serviceFn), `expected ${route.serviceFn} to be called`);
  });

  test(`${route.label}: unauthorized (no reports.view) returns 403 and never reaches ${route.serviceFn} — no data leaked`, async () => {
    authorized = false;
    const { GET } = await import(route.modulePath);
    const res = await GET(makeRequest(route.url));
    assert.equal(res.status, 403);
    assert.ok(!serviceCalls.some((c) => c.fn === route.serviceFn), `${route.serviceFn} must not run when unauthorized`);
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ["error"], "unauthorized response must carry no report payload, only an error key");
  });
}

// ---------------- Regression: query params / filters unchanged ----------------

test("batches/revenue: authorized request still passes the parsed date range through to getRevenueByBatch unchanged", async () => {
  const { GET } = await import("./batches/revenue/route");
  await GET(makeRequest("/api/reports/batches/revenue?start=2026-01-01&end=2026-01-31"));
  const call = serviceCalls.find((c) => c.fn === "getRevenueByBatch");
  assert.ok(call);
});

test("bi/revenue-trend: authorized request still passes granularity through to getRevenueTrend unchanged", async () => {
  const { GET } = await import("./bi/revenue-trend/route");
  await GET(makeRequest("/api/reports/bi/revenue-trend?granularity=month"));
  const call = serviceCalls.find((c) => c.fn === "getRevenueTrend");
  assert.equal(call!.args[1], "month");
});

test("bi/top-customers: authorized request still passes limit through to getTopCustomers unchanged", async () => {
  const { GET } = await import("./bi/top-customers/route");
  await GET(makeRequest("/api/reports/bi/top-customers?limit=5"));
  const call = serviceCalls.find((c) => c.fn === "getTopCustomers");
  assert.equal(call!.args[1], 5);
});
