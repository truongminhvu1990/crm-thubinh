import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { makeOverviewFakeClient, makeOverviewScenario, OverviewFakeData } from "@/lib/reports/fakeOverviewClient.testutil";

/**
 * Dashboard biểu đồ Wave B (F9): /api/reports/analytics/inventory - "Tồn kho hiện tại".
 * The real inventory service over the shared fake. Asserts that (1) reports.view gates it, (2) Reserved -> Held and Available -> Remaining
 * and nothing else is counted, by product RECORD and status (never the legacy counter columns), valued at products.sale_price, (3) the
 * category stacks add up EXACTLY to the existing Held / Remaining summary (count, value and unpriced count), (4) a date range has no
 * effect, (5) null / blank categories are "Chưa phân loại", (6) the drill-down detail of a category equals that category's stack,
 * (7) no cost / profit is ever returned, for any role, (8) a failed read is an error.
 */

let authorized = true;
let role = "Owner";
const permissionKeys: string[] = [];
const fakeStaff = { id: "staff-1", full_name: "Test Staff", role: "Owner", role_id: null };
let scenario: OverviewFakeData = makeOverviewScenario();
let failProducts = false;

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeWithFallback: async (q: unknown) => ({ query: q }),
    applyDataScopeByName: async (q: unknown) => ({ query: q }),
  },
});
mock.module("@/lib/permission/serverAuth", {
  namedExports: {
    requirePermission: async (_request: NextRequest, key: string) => {
      permissionKeys.push(key);
      if (!authorized) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      return { staff: { ...fakeStaff, role } };
    },
    getCurrentStaffFromRequest: async () => fakeStaff,
  },
});
const failingClient = {
  from: () => {
    const b: Record<string, unknown> = {
      select: () => b,
      in: () => b,
      eq: () => b,
      order: () => b,
      range: () => b,
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "boom" }, count: null }).then(ok, fail),
    };
    return b;
  },
};
mock.module("@/lib/supabase/server", {
  namedExports: { createClient: async () => (failProducts ? failingClient : makeOverviewFakeClient(scenario)) },
});

let GET: (r: NextRequest) => Promise<Response>;
let svc: typeof import("@/lib/reports/inventoryValue.service");
let params: typeof import("@/app/api/reports/overview/_params");

before(async () => {
  GET = (await import("./inventory/route")).GET;
  svc = await import("@/lib/reports/inventoryValue.service");
  params = await import("@/app/api/reports/overview/_params");
});

const call = async (q = "") => {
  const res = await GET(new NextRequest(`http://localhost/api/reports/analytics/inventory${q ? `?${q}` : ""}`));
  return { status: res.status, body: await res.json() };
};

function fixture(): OverviewFakeData {
  const s = makeOverviewScenario();
  const mk = (id: string, status: string, price: number | null, category: string | null, extra: Record<string, unknown> = {}) =>
    ({ id, product_code: `C-${id}`, product_name: `N ${id}`, category, status, sale_price: price, batch_id: null, salesperson: "NV", ...extra }) as never;
  s.products.push(
    mk("u1", "Available", 11, null),
    mk("u2", "Reserved", 22, "   "),
    mk("fee1", "Reserved", 33, "Phí kiểm định"),
    mk("fee2", "Available", 44, "Phí gia công"),
    // the legacy counter columns are wrong on purpose: they must never be read
    mk("c1", "Available", 5, "Nhẫn", { available: 1000, reserved: 7, sold: 9 }),
    mk("c2", "Sold", 5, "Nhẫn", { available: 1, reserved: 0, sold: 0 })
  );
  return s;
}

test("requires reports.view", async () => {
  scenario = fixture();
  authorized = false;
  permissionKeys.length = 0;
  assert.equal((await call()).status, 403);
  assert.deepEqual(permissionKeys, ["reports.view"]);
  authorized = true;
});

test("Reserved is Held, Available is Remaining; Sold / Paused / Archived are in neither; quantity = product records, value = sale_price", async () => {
  scenario = makeOverviewScenario();
  const { status, body } = await call();
  assert.equal(status, 200);
  assert.deepEqual(body.held, { count: 4, value: 360, missingPriceCount: 1 });
  assert.deepEqual(body.remaining, { count: 3, value: 175, missingPriceCount: 0 });
  assert.equal(body.range, null);
});

test("the legacy available / reserved / sold counters are ignored: counts come from status", async () => {
  scenario = fixture();
  const { body } = await call();
  const nhan = body.categories.find((c: { label: string }) => c.label === "Nhẫn");
  assert.equal(nhan.remaining.count, 2, "pA3 and c1 (c1's counter says 1000 - ignored); c2 is Sold");
  assert.equal(nhan.remaining.value, 25 + 5);
  assert.equal(nhan.held.count, 0);
});

test("the category stacks add up EXACTLY to the existing Held / Remaining summary and to the Dashboard cards (count, value, unpriced)", async () => {
  scenario = fixture();
  const { body } = await call();
  const summary = await svc.getInventoryValueSummary(makeOverviewFakeClient(scenario) as never);
  assert.deepEqual(body.held, summary.held);
  assert.deepEqual(body.remaining, summary.remaining);
  const add = (pick: "held" | "remaining", f: "count" | "value" | "missingPriceCount") =>
    body.categories.reduce((s: number, c: Record<string, Record<string, number>>) => s + c[pick][f], 0);
  for (const pick of ["held", "remaining"] as const) {
    for (const f of ["count", "value", "missingPriceCount"] as const) assert.equal(add(pick, f), summary[pick][f], `${pick}.${f}`);
  }
});

test("null and blank categories are 'Chưa phân loại'; fee categories stay visible as their own rows", async () => {
  scenario = fixture();
  const { body } = await call();
  const un = body.categories.find((c: { category: string | null }) => c.category === null);
  assert.equal(un.label, "Chưa phân loại");
  assert.equal(un.remaining.value, 11, "u1 (null category)");
  assert.equal(un.held.value, 22, "u2 (blank category)");
  assert.equal(body.categories.filter((c: { label: string }) => c.label === "Chưa phân loại").length, 1, "null and blank are ONE group");
  assert.equal(body.categories.find((c: { label: string }) => c.label === "Phí kiểm định").held.value, 33);
  assert.equal(body.categories.find((c: { label: string }) => c.label === "Phí gia công").remaining.value, 44);
});

test("the Dashboard date range has no effect: the response is identical and carries no range", async () => {
  scenario = fixture();
  const plain = await call();
  const dated = await call("start=2026-09-01&end=2026-10-01");
  const odd = await call("start=1999-01-01&end=1999-02-01");
  assert.deepEqual(dated.body, plain.body);
  assert.deepEqual(odd.body, plain.body);
  assert.equal(plain.body.range, null);
});

test("categories are ordered by total value, then product count, then name - deterministic", () => {
  const rows = [
    { id: "1", product_code: "a", product_name: "a", category: "B", status: "Available", sale_price: 10, batch_id: null, salesperson: null },
    { id: "2", product_code: "b", product_name: "b", category: "A", status: "Available", sale_price: 10, batch_id: null, salesperson: null },
    { id: "3", product_code: "c", product_name: "c", category: "C", status: "Reserved", sale_price: 50, batch_id: null, salesperson: null },
  ];
  const order = (rs: typeof rows) => svc.summarizeInventoryByCategory(rs).categories.map((c) => c.label);
  assert.deepEqual(order(rows), ["C", "A", "B"]);
  assert.deepEqual(order([...rows].reverse()), ["C", "A", "B"]);
});

test("the category drill-down detail equals that category's stack (count and value) - Held and Remaining", async () => {
  scenario = fixture();
  const client = makeOverviewFakeClient(scenario) as never;
  const breakdown = (await svc.getInventoryBreakdown(client))!;
  for (const c of breakdown.categories) {
    const filters = c.category === null ? { uncategorized: true } : { category: c.category };
    const rem = await svc.getRemainingInventoryDetail(client, filters);
    const held = await svc.getHeldInventoryDetail(client, filters);
    assert.equal(rem.count, c.remaining.count, `${c.label} remaining count`);
    assert.equal(rem.total, c.remaining.value, `${c.label} remaining value`);
    assert.equal(held.count, c.held.count, `${c.label} held count`);
    assert.equal(held.total, c.held.value, `${c.label} held value`);
  }
});

test("parseInventoryFilters: 'uncategorized' is whitelisted to 1 / true, takes precedence over category, and nothing else leaks in", () => {
  const f = (q: string) => params.parseInventoryFilters(new URLSearchParams(q));
  assert.deepEqual(f("uncategorized=1&category=Vòng"), { category: undefined, uncategorized: true, salesperson: undefined, batchId: undefined });
  assert.equal(f("uncategorized=true").uncategorized, true);
  assert.equal(f("uncategorized=yes").uncategorized, undefined);
  assert.equal(f("uncategorized=0").uncategorized, undefined);
  assert.equal(f("category=Vòng").category, "Vòng");
  assert.deepEqual(Object.keys(f("category=x&evil=1;drop")).sort(), ["batchId", "category", "salesperson", "uncategorized"]);
});

test("no cost, profit or margin appears for any role, and the payload is identical for every role", async () => {
  scenario = fixture();
  const bodies: string[] = [];
  for (const r of ["Owner", "Manager", "Sales", "Marketing", "Viewer"]) {
    role = r;
    const { status, body } = await call();
    assert.equal(status, 200, r);
    assert.doesNotMatch(JSON.stringify(body), /cost|profit|margin|giá vốn|lợi nhuận/i, r);
    bodies.push(JSON.stringify(body));
  }
  role = "Owner";
  assert.equal(new Set(bodies).size, 1);
});

test("a failed read is a 500, not an empty chart", async () => {
  scenario = fixture();
  failProducts = true;
  const { status, body } = await call();
  failProducts = false;
  assert.equal(status, 500);
  assert.equal(body.categories, undefined);
});

test("an empty inventory answers 200 with zero stacks", async () => {
  scenario = makeOverviewScenario();
  scenario.products = [];
  const { status, body } = await call();
  assert.equal(status, 200);
  assert.deepEqual(body.categories, []);
  assert.deepEqual(body.held, { count: 0, value: 0, missingPriceCount: 0 });
});
