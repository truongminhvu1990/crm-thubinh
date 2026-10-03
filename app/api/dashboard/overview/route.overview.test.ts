import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest } from "next/server";

/**
 * Phase 1 - Reporting Foundation: GET /api/dashboard/overview now sources its
 * revenue / order / sold / inventory figures from getOverviewMetrics and adds an
 * additive `overview` block with all six Overview metrics.
 *
 * Contract this file locks:
 *  - the existing response keys (customers, products, batches, purchases,
 *    orderValue, unrecognizedOrderValue) keep their shape and values, so the
 *    current Dashboard UI is unaffected;
 *  - `overview` carries the six metrics, each taken from its canonical service;
 *  - a failure in one of the NEW reads (Sold, inventory) degrades that metric to
 *    null and never breaks the existing cards.
 *
 * Phase 1.4.2 (authorization boundary): the `overview` block requires
 * `reports.view`. The "AUTH n:" tests below lock the seven cases of the
 * Release Control authorization audit: without the permission (or without a
 * staff row, or if the permission lookup fails) the response is exactly the
 * pre-Phase-1 one and Sold / inventory are never calculated.
 */

const fakeClient = { id: "request-scoped-client" };
const currentStaff = { id: "staff-1", full_name: "Test Staff" };

const purchases = { totalRevenue: 185, legacyRecognizedRevenue: 25, totalCost: 0, totalProfit: 185, bySource: [], bySalesperson: [], topCustomers: [], byPeriod: [] };
const orderValue = {
  totalOrderValue: 450,
  totalOrderCount: 6,
  orderBasedRecognizedValue: 160,
  orderBasedUnrecognizedValue: 290,
  recognizedOrderCount: 2,
  unrecognizedOrderCount: 4,
  recognizedRatio: 160 / 450,
  breakdown: [] as unknown[],
};
const soldTotals = {
  soldValue: 435, recognizedRevenue: 185, legacyRecognizedValue: 25, unrecognizedValue: 250,
  soldLines: 6, totalCustomers: 5, totalOrders: 5, recognizedOrders: 3, unrecognizedOrders: 2, recognizedRatio: 185 / 435, recognizedOrderIds: [],
};
const inventory = {
  held: { count: 4, value: 360, missingPriceCount: 1 },
  remaining: { count: 3, value: 175, missingPriceCount: 0 },
};

const requestScopedClient = { id: "request-scoped-permission-client" };
let currentStaffValue: unknown = currentStaff;
let permissionAllowed = true;
let permissionShouldThrow = false;
const permissionCalls: { staff: unknown; key: unknown; client: unknown }[] = [];
const orderValueCalls: { range: unknown; staff: unknown; client: unknown }[] = [];

let soldShouldThrow = false;
let inventoryShouldThrow = false;
const soldCalls: { filters: unknown; client: unknown; staff: unknown }[] = [];
const inventoryCalls: { client: unknown }[] = [];
const purchaseCalls: { range: unknown; client: unknown; staff: unknown }[] = [];

let GET: typeof import("./route").GET;

before(async () => {
  mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
  mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => fakeClient } });
  mock.module("@/lib/permission/serverAuth", {
    namedExports: { getCurrentStaffFromRequest: async () => currentStaffValue, createRequestClient: () => requestScopedClient },
  });
  mock.module("@/lib/permission/permissionCenter.service", {
    namedExports: {
      staffHasPermission: async (staff: unknown, key: unknown, client: unknown) => {
        permissionCalls.push({ staff, key, client });
        if (permissionShouldThrow) throw new Error("boom: permission lookup failed");
        return permissionAllowed;
      },
    },
  });
  mock.module("@/lib/customer.service", {
    namedExports: { getCustomerStats: async () => ({ total: 7, vip: 1, normal: 6, recentlyContacted: 2 }) },
  });
  mock.module("@/lib/reports/reports.service", {
    namedExports: {
      getProductReportData: async () => ({ total: 9 }),
      getBatchStaticReportData: async () => ({ totalBatches: 3 }),
      getPurchaseReportData: async (range: unknown, client: unknown, staff: unknown) => {
        purchaseCalls.push({ range, client, staff });
        return purchases;
      },
    },
  });
  mock.module("@/lib/orders/orderValueSummary.service", {
    namedExports: {
      getOrderValueSummary: async (range: unknown, staff: unknown, client: unknown) => {
        orderValueCalls.push({ range, staff, client });
        return orderValue;
      },
    },
  });
  mock.module("@/lib/monthlySoldProducts/soldDataset", {
    namedExports: {
      getSoldTotals: async (filters: unknown, client: unknown, staff: unknown) => {
        soldCalls.push({ filters, client, staff });
        if (soldShouldThrow) throw new Error("boom: sold read failed");
        return soldTotals;
      },
    },
  });
  mock.module("@/lib/reports/inventoryValue.service", {
    namedExports: {
      getInventoryValueSummary: async (client: unknown) => {
        inventoryCalls.push({ client });
        if (inventoryShouldThrow) throw new Error("boom: inventory read failed");
        return inventory;
      },
    },
  });

  GET = (await import("./route")).GET;
});

function reset() {
  currentStaffValue = currentStaff;
  permissionAllowed = true;
  permissionShouldThrow = false;
  permissionCalls.length = 0;
  orderValueCalls.length = 0;
  soldShouldThrow = false;
  inventoryShouldThrow = false;
  soldCalls.length = 0;
  inventoryCalls.length = 0;
  purchaseCalls.length = 0;
}

const req = (query = "?start=2026-09-01&end=2026-10-01") => new NextRequest(`http://localhost/api/dashboard/overview${query}`);

test("existing response keys keep their exact values; `overview` is purely additive", async () => {
  reset();
  const body = await (await GET(req())).json();

  assert.deepEqual(body.customers, { total: 7, vip: 1, normal: 6, recentlyContacted: 2 });
  assert.deepEqual(body.products, { total: 9 });
  assert.deepEqual(body.batches, { totalBatches: 3 });
  assert.deepEqual(body.purchases, purchases);
  assert.deepEqual(body.orderValue, orderValue);
  assert.equal(body.unrecognizedOrderValue, 290);
  assert.deepEqual(
    Object.keys(body).sort(),
    ["batches", "customers", "orderValue", "overview", "products", "purchases", "unrecognizedOrderValue"]
  );
});

test("`overview` carries the six metrics from their canonical services", async () => {
  reset();
  const { overview } = await (await GET(req())).json();

  assert.deepEqual(overview.range, { start: "2026-09-01", end: "2026-10-01" });
  assert.deepEqual(overview.totalOrderValue, { value: 450, orderCount: 6 });
  assert.deepEqual(overview.recognizedRevenue, { value: 185, linkedValue: 160, legacyValue: 25 });
  assert.deepEqual(overview.unrecognizedValue, { value: 290, orderCount: 4 });
  assert.deepEqual(overview.held, { count: 4, value: 360, missingPriceCount: 1 });
  assert.deepEqual(overview.remaining, { count: 3, value: 175, missingPriceCount: 0 });
  assert.deepEqual(overview.sold, { value: 435, recognizedValue: 185, unrecognizedValue: 250, orderCount: 5, lineCount: 6 });
});

test("the legacy unrecognizedOrderValue and the new overview.unrecognizedValue are the same number (one definition)", async () => {
  reset();
  const body = await (await GET(req())).json();
  assert.equal(body.unrecognizedOrderValue, body.overview.unrecognizedValue.value);
});

test("the Sold read receives the SAME date range, client and staff as the Dashboard's revenue read", async () => {
  reset();
  await GET(req());

  assert.equal(soldCalls.length, 1);
  assert.deepEqual(soldCalls[0].filters, { page: 1, dateFrom: "2026-09-01", dateTo: "2026-10-01" });
  assert.deepEqual(purchaseCalls[0].range, { start: "2026-09-01", end: "2026-10-01" });
  assert.equal(soldCalls[0].client, fakeClient);
  assert.equal(soldCalls[0].staff, currentStaff);
  assert.equal(inventoryCalls[0].client, fakeClient);
});

test("no range = all time: null range, and the Sold read gets no date bounds", async () => {
  reset();
  const { overview } = await (await GET(req(""))).json();
  assert.equal(overview.range, null);
  assert.deepEqual(soldCalls[0].filters, { page: 1, dateFrom: undefined, dateTo: undefined });
  assert.equal(purchaseCalls[0].range, null);
});

test("RESILIENCE: if the Sold read fails, overview.sold is null and every existing card is untouched (200, not 500)", async () => {
  reset();
  soldShouldThrow = true;
  const res = await GET(req());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.overview.sold, null);
  assert.deepEqual(body.overview.held, { count: 4, value: 360, missingPriceCount: 1 }, "an unrelated metric is unaffected");
  assert.equal(body.purchases.totalRevenue, 185);
  assert.equal(body.orderValue.totalOrderValue, 450);
  assert.equal(body.unrecognizedOrderValue, 290);
});

test("RESILIENCE: if the inventory read fails, held / remaining are null and everything else is intact", async () => {
  reset();
  inventoryShouldThrow = true;
  const res = await GET(req());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.overview.held, null);
  assert.equal(body.overview.remaining, null);
  assert.equal(body.overview.sold.value, 435);
  assert.equal(body.overview.recognizedRevenue.value, 185);
});

// ---------------------------------------------------------------------------
// Phase 1.4.2 - authorization boundary (the 7 cases of the Release Control audit)
// ---------------------------------------------------------------------------

const LEGACY_KEYS = ["batches", "customers", "orderValue", "products", "purchases", "unrecognizedOrderValue"];
// What the pre-Phase-1 route returned for these exact fixtures.
const PRE_PHASE_1_GOLDEN = {
  customers: { total: 7, vip: 1, normal: 6, recentlyContacted: 2 },
  products: { total: 9 },
  batches: { totalBatches: 3 },
  purchases,
  orderValue,
  unrecognizedOrderValue: 290,
};

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

test("AUTH 1: WITH reports.view - full overview (six canonical metrics); the grant is checked with 'reports.view', the resolved staff and the REQUEST-scoped client", async () => {
  reset();
  const res = await GET(req());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(body.overview).sort(), ["held", "range", "recognizedRevenue", "remaining", "sold", "totalOrderValue", "unrecognizedValue"]);
  assert.deepEqual(body.overview.totalOrderValue, { value: 450, orderCount: 6 });
  assert.deepEqual(body.overview.recognizedRevenue, { value: 185, linkedValue: 160, legacyValue: 25 });
  assert.deepEqual(body.overview.unrecognizedValue, { value: 290, orderCount: 4 });
  assert.deepEqual(body.overview.held, { count: 4, value: 360, missingPriceCount: 1 });
  assert.deepEqual(body.overview.remaining, { count: 3, value: 175, missingPriceCount: 0 });
  assert.equal(body.overview.sold.value, 435);

  assert.equal(permissionCalls.length, 1);
  assert.equal(permissionCalls[0].key, "reports.view");
  assert.equal(permissionCalls[0].staff, currentStaff);
  assert.equal(permissionCalls[0].client, requestScopedClient);
  assert.notEqual(permissionCalls[0].client, fakeClient, "the grant is resolved with the request client, not the data client");
  assert.equal(soldCalls.length, 1);
  assert.equal(inventoryCalls.length, 1);
});

test("AUTH 2: WITHOUT reports.view - exactly the six pre-Phase-1 keys, no overview, legacy values equal the pre-Phase-1 golden", async () => {
  reset();
  permissionAllowed = false;
  const res = await GET(req());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(body).sort(), LEGACY_KEYS);
  assert.ok(!("overview" in body));
  assert.deepEqual(body, PRE_PHASE_1_GOLDEN);
});

test("AUTH 3: WITHOUT reports.view - Sold and Held/Remaining are never calculated; the legacy reads get the same range / client / staff", async () => {
  reset();
  permissionAllowed = false;
  await GET(req());

  assert.equal(soldCalls.length, 0, "getSoldTotals must not run");
  assert.equal(inventoryCalls.length, 0, "getInventoryValueSummary must not run (so getOverviewMetrics is not reached)");
  assert.equal(purchaseCalls.length, 1);
  assert.deepEqual(purchaseCalls[0].range, { start: "2026-09-01", end: "2026-10-01" });
  assert.equal(purchaseCalls[0].client, fakeClient);
  assert.equal(purchaseCalls[0].staff, currentStaff);
  assert.equal(orderValueCalls.length, 1);
  assert.deepEqual(orderValueCalls[0].range, { start: "2026-09-01", end: "2026-10-01" });
  assert.equal(orderValueCalls[0].staff, currentStaff);
  assert.equal(orderValueCalls[0].client, fakeClient);
});

test("AUTH 4: LEAKAGE - the unauthorized response contains no sold / held / remaining / overview, neither as text nor as any key", async () => {
  reset();
  permissionAllowed = false;
  const body = await (await GET(req())).json();
  const text = JSON.stringify(body).toLowerCase();

  for (const word of ["sold", "held", "remaining", "overview"]) {
    assert.ok(!text.includes(word), `serialized response must not contain "${word}"`);
  }
  const keys = keysDeep(body).map((k) => k.toLowerCase());
  for (const word of ["sold", "held", "remaining", "overview"]) {
    assert.ok(!keys.includes(word), `no key named "${word}" anywhere in the response`);
  }
});

test("AUTH 5: staff === null - fail closed: no overview, no Sold/Held/Remaining calls, no permission lookup, legacy keys intact (200)", async () => {
  reset();
  currentStaffValue = null;
  const res = await GET(req());
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(!("overview" in body));
  assert.deepEqual(Object.keys(body).sort(), LEGACY_KEYS);
  assert.equal(soldCalls.length, 0);
  assert.equal(inventoryCalls.length, 0);
  assert.equal(permissionCalls.length, 0, "there is nobody to look a grant up for");
  assert.equal(purchaseCalls[0].staff, null, "legacy behavior for the base keys is unchanged (not part of this phase)");
});

test("AUTH 6: the permission lookup throws - fail closed: still 200, no overview, legacy keys intact, nothing Sold/inventory calculated", async () => {
  reset();
  permissionShouldThrow = true;
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  let res: Response;
  try {
    res = await GET(req());
  } finally {
    console.error = original;
  }
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(!("overview" in body));
  assert.deepEqual(body, PRE_PHASE_1_GOLDEN);
  assert.equal(soldCalls.length, 0);
  assert.equal(inventoryCalls.length, 0);
  assert.equal(logged.length, 1, "the failure is logged once, not swallowed silently");
});

test("AUTH 7: unrecognizedOrderValue is the same legacy value whether or not the caller holds reports.view", async () => {
  reset();
  const authorized = await (await GET(req())).json();
  reset();
  permissionAllowed = false;
  const unauthorized = await (await GET(req())).json();

  assert.equal(authorized.unrecognizedOrderValue, 290);
  assert.equal(unauthorized.unrecognizedOrderValue, authorized.unrecognizedOrderValue);
  assert.equal(unauthorized.unrecognizedOrderValue, unauthorized.orderValue.orderBasedUnrecognizedValue);
  // and every legacy key is value-identical in both states
  for (const key of LEGACY_KEYS) assert.deepEqual(unauthorized[key], authorized[key], `legacy key "${key}" is identical in both states`);
});
