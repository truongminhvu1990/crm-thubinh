import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { applyWindow, WindowState } from "@/lib/reports/postgrestFake.testutil";

/**
 * Dashboard biểu đồ Wave B (F4 / F5 / F8): /api/reports/analytics/composition.
 * The real service + canonical recognition rule + the real fetchPurchaseRows paging, over a small PostgREST-faithful fake.
 * Asserts at the API boundary that (1) reports.view gates it, (2) only BR-001 / BR-002 rows are counted (Completed+Paid linked, or legacy;
 * never Partially Paid, Reserved, Cancelled-linked or orphan), (3) the three groupings and the KPI total are one number, equal to
 * getPurchaseReportData's, (4) a bad historical date is neither repaired nor dropped, (5) no cost / profit leaves the payload for any role,
 * (6) a failed read is an error and not an empty chart, (7) a range with more rows than PostgREST's 1000-row cap is read completely.
 */

let authorized = true;
let role = "Owner";
const permissionKeys: string[] = [];
const fakeStaff = { id: "staff-1", full_name: "Test Staff", role: "Owner", role_id: null };

interface FakePurchase {
  id: string;
  product_id: string | null;
  sale_price: number | string | null;
  sale_date: string;
  order_item_id: string | null;
  order: { order_status: string; payment_status: string } | null;
  product: { product_code: string; product_name: string } | null;
}
interface FakeProduct {
  id: string;
  category: string | null;
  cost_price: number | null;
}

let purchases: FakePurchase[] = [];
let products: FakeProduct[] = [];
let failPurchases = false;
let failProducts = false;
const productLookups: string[][] = [];
const writes: string[] = [];

function makeClient() {
  return {
    from(table: string) {
      const f = { gte: undefined as string | undefined, lt: undefined as string | undefined, ids: undefined as string[] | undefined };
      const w: WindowState = {};
      let selected = "";
      const WRITE = (name: string) => () => {
        writes.push(`${table}.${name}`);
        throw new Error(`unexpected write: ${table}.${name}`);
      };
      const builder: Record<string, unknown> = {
        insert: WRITE("insert"),
        update: WRITE("update"),
        delete: WRITE("delete"),
        upsert: WRITE("upsert"),
        select: (cols?: string, opts?: { count?: string }) => {
          selected = cols ?? "";
          if (opts?.count === "exact") w.countExact = true;
          return builder;
        },
        gte: (_c: string, v: string) => ((f.gte = v), builder),
        lt: (_c: string, v: string) => ((f.lt = v), builder),
        in: (_c: string, v: string[]) => ((f.ids = v), builder),
        order: (col: string, o?: { ascending?: boolean }) => ((w.order = { col, ascending: o?.ascending ?? true }), builder),
        range: (a: number, b: number) => ((w.range = [a, b]), builder),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => {
          if (table === "customer_purchases") {
            if (failPurchases) return Promise.resolve({ data: null, error: { message: "boom" }, count: null }).then(ok, fail);
            const rows = purchases
              .filter((p) => (f.gte === undefined || p.sale_date >= f.gte) && (f.lt === undefined || p.sale_date < f.lt))
              .map((p) => ({
                id: p.id,
                customer_id: "c1",
                product_id: p.product_id,
                sale_price: p.sale_price,
                sale_date: p.sale_date,
                source: null,
                salesperson: "NV",
                order_item_id: p.order_item_id,
                order_items: p.order_item_id ? { id: p.order_item_id, order_id: "o", orders: p.order } : null,
                customer: { full_name: "Khách", customer_code: "KH" },
                product: p.product,
              }));
            const { data, count } = applyWindow(rows, w, undefined, table);
            return Promise.resolve({ data, error: null, count }).then(ok, fail);
          }
          if (table === "products") {
            if (selected.includes("category")) {
              productLookups.push(f.ids ?? []);
              if (failProducts) return Promise.resolve({ data: null, error: { message: "boom" } }).then(ok, fail);
              const data = products.filter((p) => !f.ids || f.ids.includes(p.id)).map((p) => ({ id: p.id, category: p.category }));
              return Promise.resolve({ data, error: null }).then(ok, fail);
            }
            // "id, cost_price" - only getPurchaseReportData's own cost lookup; selectIn pages it with a range
            const data = products.filter((p) => !f.ids || f.ids.includes(p.id)).map((p) => ({ id: p.id, cost_price: p.cost_price }));
            const { data: rows, count } = applyWindow(data, w, undefined, table);
            return Promise.resolve({ data: rows, error: null, count }).then(ok, fail);
          }
          return Promise.resolve({ data: [], error: null }).then(ok, fail);
        },
      };
      return builder;
    },
  };
}

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
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => makeClient() } });

let GET: (r: NextRequest) => Promise<Response>;
let getPurchaseReportData: typeof import("@/lib/reports/reports.service").getPurchaseReportData;

before(async () => {
  GET = (await import("./composition/route")).GET;
  ({ getPurchaseReportData } = await import("@/lib/reports/reports.service"));
});

const COMPLETED_PAID = { order_status: "Completed", payment_status: "Paid" };
const prod = (id: string) => ({ product_code: `SP-${id}`, product_name: `Sản phẩm ${id}` });

function baseFixture() {
  products = [
    { id: "pA", category: "Vòng", cost_price: 1_000_000 },
    { id: "pB", category: "Nhẫn", cost_price: null },
    { id: "pC", category: null, cost_price: 500_000 },
    { id: "pF", category: "Phí vận chuyển", cost_price: null },
    { id: "pD", category: "Vòng", cost_price: null },
    { id: "pE", category: "Chuỗi", cost_price: null },
  ];
  purchases = [
    // recognized: BR-001 (Completed + Paid, linked)
    { id: "1", product_id: "pA", sale_price: 5_000_000, sale_date: "2026-09-03", order_item_id: "i1", order: COMPLETED_PAID, product: prod("pA") },
    { id: "2", product_id: "pB", sale_price: 12_000_000, sale_date: "2026-09-10", order_item_id: "i2", order: COMPLETED_PAID, product: prod("pB") },
    // the same product bought again, and another item of the same order
    { id: "3", product_id: "pA", sale_price: 4_999_999, sale_date: "2026-09-12", order_item_id: "i3", order: COMPLETED_PAID, product: prod("pA") },
    { id: "4", product_id: "pF", sale_price: 100_000, sale_date: "2026-09-12", order_item_id: "i4", order: COMPLETED_PAID, product: prod("pF") },
    // recognized: BR-002 (legacy, no linked order)
    { id: "5", product_id: "pC", sale_price: 150_000_000, sale_date: "2026-09-15", order_item_id: null, order: null, product: prod("pC") },
    // NOT recognized: Completed but Partially Paid, Reserved, Cancelled-linked, linked row whose order cannot be found
    { id: "6", product_id: "pD", sale_price: 70_000_000, sale_date: "2026-09-16", order_item_id: "i6", order: { order_status: "Completed", payment_status: "Partially Paid" }, product: prod("pD") },
    { id: "7", product_id: "pD", sale_price: 3_000_000, sale_date: "2026-09-17", order_item_id: "i7", order: { order_status: "Reserved", payment_status: "Paid" }, product: prod("pD") },
    { id: "8", product_id: "pD", sale_price: 9_000_000, sale_date: "2026-09-18", order_item_id: "i8", order: { order_status: "Cancelled", payment_status: "Paid" }, product: prod("pD") },
    { id: "9", product_id: "pD", sale_price: 8_000_000, sale_date: "2026-09-19", order_item_id: "i9", order: null, product: prod("pD") },
    // recognized legacy row with a dangling product (the product row no longer exists)
    { id: "10", product_id: "gone", sale_price: 20_000_000, sale_date: "2026-09-20", order_item_id: null, order: null, product: null },
    // outside September
    { id: "11", product_id: "pE", sale_price: 60_000_000, sale_date: "2026-08-20", order_item_id: null, order: null, product: prod("pE") },
    // the historical bad-date legacy row (counted all-time, never repaired, never deleted)
    { id: "12", product_id: "pE", sale_price: 18_000_000, sale_date: "111111-11-01", order_item_id: null, order: null, product: prod("pE") },
  ];
  failPurchases = false;
  failProducts = false;
  productLookups.length = 0;
  writes.length = 0;
}

const SEPT = "start=2026-09-01&end=2026-10-01";
const get = async (q = SEPT) => {
  const res = await GET(new NextRequest(`http://localhost/api/reports/analytics/composition${q ? `?${q}` : ""}`));
  return { status: res.status, body: await res.json() };
};
const sum = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);

test("requires reports.view", async () => {
  baseFixture();
  authorized = false;
  permissionKeys.length = 0;
  assert.equal((await get()).status, 403);
  assert.deepEqual(permissionKeys, ["reports.view"]);
  authorized = true;
});

test("rejects a half-specified or malformed range (400), like the other Dashboard endpoints", async () => {
  baseFixture();
  assert.equal((await get("start=2026-09-01")).status, 400);
  assert.equal((await get("start=2026-09-01&end=nope")).status, 400);
  assert.equal((await get("start=2026-10-01&end=2026-09-01")).status, 400);
});

test("only BR-001 / BR-002 rows are counted: Partially Paid, Reserved, Cancelled-linked and orphan-linked purchases are not", async () => {
  baseFixture();
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.dateBasis, "sale_date");
  // 5,000,000 + 12,000,000 + 4,999,999 + 100,000 + 150,000,000 + 20,000,000
  assert.equal(body.total, 192_099_999);
  assert.equal(body.count, 6);
  const ids = body.topProducts.rows.map((r: { productId: string | null }) => r.productId);
  assert.ok(!ids.includes("pD"), "pD only has unrecognized purchases");
});

test("F4 / F5 / F8 all add up to the same total, and that total is the canonical recognized revenue (getPurchaseReportData)", async () => {
  baseFixture();
  const { body } = await get();
  const canonical = await getPurchaseReportData({ start: "2026-09-01", end: "2026-10-01" }, makeClient() as never, null);
  assert.equal(body.total, canonical.totalRevenue);
  assert.equal(sum(body.topProducts.rows) + body.topProducts.others.value, body.total);
  assert.equal(sum(body.categories), body.total);
  assert.equal(sum(body.priceBands), body.total);

  const all = await get("");
  const canonicalAll = await getPurchaseReportData(null, makeClient() as never, null);
  assert.equal(all.body.total, canonicalAll.totalRevenue, "all time reconciles too");
});

test("F4 Top Products: ranked by recognized value; a repeated product aggregates; the dangling product is labelled, not dropped", async () => {
  baseFixture();
  const { body } = await get();
  const rows = body.topProducts.rows as { productId: string | null; label: string; value: number; count: number }[];
  assert.deepEqual(rows.map((r) => r.value), [150_000_000, 20_000_000, 12_000_000, 9_999_999, 100_000]);
  assert.equal(rows[0].productId, "pC");
  const pA = rows.find((r) => r.productId === "pA");
  assert.equal(pA?.value, 9_999_999);
  assert.equal(pA?.count, 2);
  const unknown = rows.find((r) => r.label === "Sản phẩm không xác định");
  assert.equal(unknown?.value, 20_000_000);
  assert.equal(unknown?.productId, null);
});

test("F5 Top Product Types: products.category, null -> 'Chưa phân loại', fee categories stay visible, dangling product is uncategorized", async () => {
  baseFixture();
  const { body } = await get();
  const byLabel = Object.fromEntries(body.categories.map((c: { label: string }) => [c.label, c]));
  assert.equal(byLabel["Nhẫn"].value, 12_000_000);
  assert.equal(byLabel["Vòng"].value, 9_999_999);
  assert.equal(byLabel["Phí vận chuyển"].value, 100_000);
  assert.equal(byLabel["Chưa phân loại"].value, 170_000_000, "pC (no category) + the dangling product");
  assert.equal(byLabel["Chưa phân loại"].category, null);
  assert.equal(body.categories[0].label, "Chưa phân loại", "ranked by value, descending");
});

test("F8 Price Bands: realized sale_price, edges lower-inclusive / upper-exclusive; every row in exactly one band", async () => {
  baseFixture();
  const { body } = await get();
  const band = (k: string) => body.priceBands.find((b: { key: string }) => b.key === k);
  assert.equal(band("under5m").value, 4_999_999 + 100_000, "4,999,999 and 100,000 are below 5 triệu");
  assert.equal(band("5to10m").value, 5_000_000, "exactly 5,000,000 belongs to 5-10 triệu");
  assert.equal(band("10to20m").value, 12_000_000 + 20_000_000 - 20_000_000, "12,000,000 only: 20,000,000 is the next band");
  assert.equal(band("20to50m").value, 20_000_000, "exactly 20,000,000 belongs to 20-50 triệu");
  assert.equal(band("from100m").value, 150_000_000);
  assert.equal(body.priceBands.reduce((s: number, b: { count: number }) => s + b.count, 0), body.count);
  assert.equal(band("noPrice"), undefined);
});

test("a missing / unusable price is shown as 'Không có giá' and the total still reconciles", async () => {
  baseFixture();
  purchases.push({ id: "20", product_id: "pA", sale_price: null, sale_date: "2026-09-21", order_item_id: null, order: null, product: prod("pA") });
  const { body } = await get();
  const none = body.priceBands.find((b: { key: string }) => b.key === "noPrice");
  assert.equal(none.count, 1);
  assert.equal(sum(body.priceBands), body.total);
  assert.equal(body.total, 192_099_999);
});

test("the historical bad-date legacy row is counted all-time, absent from a real range, and never repaired or deleted", async () => {
  baseFixture();
  const before = JSON.stringify(purchases);
  const all = await get("");
  const sept = await get();
  assert.equal(all.body.total - sept.body.total, 60_000_000 + 18_000_000, "August 60M + the bad-date 18M exist only in the all-time view");
  assert.equal(all.body.categories.find((c: { label: string }) => c.label === "Chuỗi").value, 78_000_000);
  assert.equal(JSON.stringify(purchases), before, "nothing was rewritten");
  assert.deepEqual(writes, [], "no write method was ever called");
});

test("no cost, profit or margin appears in the payload for any role, and the payload is identical for every role", async () => {
  baseFixture();
  const bodies: string[] = [];
  for (const r of ["Owner", "Manager", "Sales", "Marketing", "Viewer"]) {
    role = r;
    const { status, body } = await get();
    assert.equal(status, 200, r);
    const text = JSON.stringify(body);
    assert.doesNotMatch(text, /cost|profit|margin|lợi nhuận|giá vốn/i, r);
    bodies.push(text);
  }
  assert.equal(new Set(bodies).size, 1, "the same rows for every role that may view reports");
  role = "Owner";
});

test("a failed read is a 500, never an empty chart or a silent 'Chưa phân loại'", async () => {
  baseFixture();
  failProducts = true;
  assert.equal((await get()).status, 500);
  failProducts = false;
  failPurchases = true;
  assert.equal((await get()).status, 500);
  failPurchases = false;
  assert.equal((await get()).status, 200);
});

test("a range with more rows than PostgREST's 1000-row cap is read completely, and the categories are looked up in chunks", async () => {
  baseFixture();
  products = Array.from({ length: 450 }, (_, i) => ({ id: `q${i}`, category: i % 2 ? "Vòng" : "Nhẫn", cost_price: null }));
  purchases = Array.from({ length: 1205 }, (_, i) => ({
    id: String(1000 + i).padStart(5, "0"),
    product_id: `q${i % 450}`,
    sale_price: 1_000_000,
    sale_date: "2026-09-05",
    order_item_id: null,
    order: null,
    product: prod(`q${i % 450}`),
  }));
  const { body } = await get();
  assert.equal(body.count, 1205);
  assert.equal(body.total, 1205 * 1_000_000);
  assert.equal(sum(body.categories), body.total);
  assert.ok(productLookups.length >= 3 && productLookups.every((c) => c.length <= 200), "ids are chunked, 450 ids -> at least 3 lookups of <= 200");
});

test("an empty period answers 200 with an all-zero structure (the UI shows its empty state)", async () => {
  baseFixture();
  const { status, body } = await get("start=2030-01-01&end=2030-02-01");
  assert.equal(status, 200);
  assert.equal(body.total, 0);
  assert.equal(body.count, 0);
  assert.deepEqual(body.topProducts.rows, []);
  assert.deepEqual(body.categories, []);
});
