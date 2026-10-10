import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { applyWindow, WindowState } from "@/lib/reports/postgrestFake.testutil";
import { buildComposition, CompositionLine } from "@/lib/reports/analytics/composition";
import { categoryLedgerHref, priceBandLedgerHref, productLedgerHref } from "@/lib/reports/analytics/compositionHref";

/**
 * Dashboard Wave B drill-down: a chart click must open EXACTLY the rows the bar was made of.
 * The real /api/sales-ledger (+ export) route, the real repository filter code and the real summary, over an in-memory `sales_ledger` view.
 * For every bar of F4 / F5 / F8 the href the Dashboard builds is replayed against the route and the ledger's recognized total and row count
 * must equal the bar's value and count - with unrecognized rows of the same product / category / band present to prove the filters bite.
 * Also: backward compatibility (no new parameter -> no new filter call), strict validation (400), and the export route.
 */

interface LedgerRow {
  purchase_id: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  product_category: string | null;
  sale_amount: number;
  sale_date: string;
  commission_amount: number | null;
  is_revenue_recognized: boolean;
}

let rows: LedgerRow[] = [];
const filterCalls: string[] = [];
let permissionKey = "";

function makeLedgerClient() {
  return {
    from(table: string) {
      if (table !== "sales_ledger") {
        const b: Record<string, unknown> = {
          select: () => b,
          in: () => b,
          eq: () => b,
          order: () => b,
          then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, fail),
        };
        return b;
      }
      const preds: ((r: LedgerRow) => boolean)[] = [];
      const w: WindowState = {};
      const num = (v: unknown) => Number(v);
      const builder: Record<string, unknown> = {
        select: (_c?: string, opts?: { count?: string }) => {
          if (opts?.count === "exact") w.countExact = true;
          return builder;
        },
        eq: (col: string, v: unknown) => (filterCalls.push(`eq:${col}`), preds.push((r) => (r as never as Record<string, unknown>)[col] === v), builder),
        gte: (col: string, v: unknown) => (filterCalls.push(`gte:${col}`), preds.push((r) => (typeof v === "number" ? num((r as never as Record<string, unknown>)[col]) >= v : String((r as never as Record<string, unknown>)[col]) >= String(v))), builder),
        lt: (col: string, v: unknown) => (filterCalls.push(`lt:${col}`), preds.push((r) => (typeof v === "number" ? num((r as never as Record<string, unknown>)[col]) < v : String((r as never as Record<string, unknown>)[col]) < String(v))), builder),
        lte: (col: string, v: unknown) => (filterCalls.push(`lte:${col}`), preds.push((r) => num((r as never as Record<string, unknown>)[col]) <= num(v)), builder),
        ilike: (col: string, pattern: string) => {
          filterCalls.push(`ilike:${col}`);
          const needle = pattern.replace(/%/g, "").toLowerCase();
          preds.push((r) => String((r as never as Record<string, unknown>)[col] ?? "").toLowerCase().includes(needle));
          return builder;
        },
        or: (expr: string) => {
          filterCalls.push(`or:${expr}`);
          // the ONLY or() these tests allow: the "no category" rule (null, empty or whitespace-only)
          if (expr !== "product_category.is.null,product_category.match.^[[:space:]]*$") throw new Error(`unexpected or(): ${expr}`);
          preds.push((r) => r.product_category === null || /^[\s]*$/.test(r.product_category));
          return builder;
        },
        order: (col: string, o?: { ascending?: boolean }) => ((w.order = { col, ascending: o?.ascending ?? true }), builder),
        range: (a: number, b: number) => ((w.range = [a, b]), builder),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => {
          const matched = rows.filter((r) => preds.every((p) => p(r)));
          const { data, count } = applyWindow(matched, w, undefined, table);
          return Promise.resolve({ data, error: null, count }).then(ok, fail);
        },
      };
      return builder;
    },
  };
}

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: { applyDataScopeWithFallback: async (q: unknown) => ({ query: q }), applyDataScopeByName: async (q: unknown) => ({ query: q }) },
});
mock.module("@/lib/permission/serverAuth", {
  namedExports: {
    requirePermission: async (_r: NextRequest, key: string) => {
      permissionKey = key;
      return { staff: null };
    },
    getCurrentStaffFromRequest: async () => null,
  },
});
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => makeLedgerClient() } });

let list: (r: NextRequest) => Promise<Response>;
let exportRoute: (r: NextRequest) => Promise<Response>;

before(async () => {
  list = (await import("./route")).GET;
  exportRoute = (await import("./export/route")).GET;
});

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEPT = { start: "2026-09-01", end: "2026-10-01" };

function row(id: string, productN: number, category: string | null, amount: number, date: string, recognized: boolean): LedgerRow {
  return {
    purchase_id: id,
    customer_id: "c1",
    customer_name: "Khách",
    customer_code: "KH",
    product_id: uid(productN),
    product_code: `SP${productN}`,
    product_name: `Sản phẩm ${productN}`,
    product_category: category,
    sale_amount: amount,
    sale_date: date,
    commission_amount: null,
    is_revenue_recognized: recognized,
  };
}

function fixture(): LedgerRow[] {
  return [
    // recognized
    row("r1", 1, "Vòng", 5_000_000, "2026-09-03", true),
    row("r2", 1, "Vòng", 4_999_999, "2026-09-12", true),
    row("r3", 2, "Nhẫn", 12_000_000, "2026-09-10", true),
    row("r4", 3, null, 150_000_000, "2026-09-15", true),
    row("r5", 4, "   ", 7_000_000, "2026-09-16", true),
    row("r6", 5, "", 3_000_000, "2026-09-17", true),
    row("r7", 6, "Phí vận chuyển", 100_000, "2026-09-12", true),
    row("r8", 7, "Vòng", 100_000_000, "2026-09-18", true),
    row("r9", 8, "Vòng", 50_000_000, "2026-09-19", true),
    row("r10", 1, "Vòng", 20_000_000, "2026-08-20", true),
    row("r11", 9, "Chuỗi", 18_000_000, "111111-11-01", true),
    // NOT recognized, deliberately in the same product / category / band as recognized rows above
    row("u1", 1, "Vòng", 5_000_000, "2026-09-20", false),
    row("u2", 2, "Nhẫn", 12_000_000, "2026-09-21", false),
    row("u3", 3, null, 150_000_000, "2026-09-22", false),
    row("u4", 8, "Vòng", 50_000_000, "2026-09-23", false),
  ];
}

const get = async (h: (r: NextRequest) => Promise<Response>, query: string, path = "api/sales-ledger") => {
  const res = await h(new NextRequest(`http://localhost/${path}?${query}`));
  return { status: res.status, body: await res.json() };
};

function lines(inRange: (d: string) => boolean): CompositionLine[] {
  return rows
    .filter((r) => r.is_revenue_recognized && inRange(r.sale_date))
    .map((r) => ({ productId: r.product_id, productCode: r.product_code, productName: r.product_name, category: r.product_category, productFound: true, price: r.sale_amount }));
}

/** The query string the Sales Ledger page ends up sending for an href: the same parameter names, passed through unchanged. */
const queryOf = (href: string) => new URL(href, "http://x").search.slice(1);

for (const [name, range] of [["September", SEPT], ["all time", null]] as const) {
  test(`click = bar (${name}): every F4 product, F5 category and F8 band opens exactly the rows it was made of`, async () => {
    rows = fixture();
    const inRange = (d: string) => (range ? d >= range.start && d < range.end : true);
    const comp = buildComposition(lines(inRange), 50);
    let checked = 0;

    for (const p of comp.topProducts.rows) {
      const href = productLedgerHref(p.productId, range)!;
      const { status, body } = await get(list, queryOf(href));
      assert.equal(status, 200, p.label);
      assert.equal(body.summary.totalRevenue, p.value, `product ${p.label} value`);
      assert.equal(body.totalCount, p.count, `product ${p.label} rows`);
      checked++;
    }
    for (const c of comp.categories) {
      const href = categoryLedgerHref(c.category, range);
      const { status, body } = await get(list, queryOf(href));
      assert.equal(status, 200, c.label);
      assert.equal(body.summary.totalRevenue, c.value, `category ${c.label} value`);
      assert.equal(body.totalCount, c.count, `category ${c.label} rows`);
      checked++;
    }
    for (const b of comp.priceBands) {
      const href = priceBandLedgerHref(b, range);
      assert.ok(href, b.key);
      const { status, body } = await get(list, queryOf(href));
      assert.equal(status, 200, b.key);
      assert.equal(body.summary.totalRevenue, b.value, `band ${b.label} value`);
      assert.equal(body.totalCount, b.count, `band ${b.label} rows`);
      checked++;
    }
    assert.ok(checked >= 10, "the fixture exercises every kind of bar");
    assert.equal(permissionKey, "reports.view");
  });
}

test("the whitespace-only and empty categories are the SAME 'Chưa phân loại' group in the bar and in the ledger", async () => {
  rows = fixture();
  const comp = buildComposition(lines(() => true), 50);
  const none = comp.categories.find((c) => c.category === null)!;
  assert.equal(none.value, 150_000_000 + 7_000_000 + 3_000_000);
  const { body } = await get(list, queryOf(categoryLedgerHref(null, null)));
  assert.equal(body.summary.totalRevenue, none.value);
  assert.equal(body.totalCount, 3);
});

test("a band edge is exact: exactly 50,000,000 / 100,000,000 / 5,000,000 fall in the upper band in the ledger as on the Dashboard", async () => {
  rows = fixture();
  const comp = buildComposition(lines(() => true), 50);
  const val = (k: string) => comp.priceBands.find((b) => b.key === k)!;
  const ledger = async (k: string) => (await get(list, queryOf(priceBandLedgerHref(val(k), null)!))).body;
  assert.equal((await ledger("5to10m")).summary.totalRevenue, 5_000_000 + 7_000_000);
  assert.equal((await ledger("50to100m")).summary.totalRevenue, 50_000_000);
  assert.equal((await ledger("from100m")).summary.totalRevenue, 150_000_000 + 100_000_000);
  assert.equal((await ledger("under5m")).summary.totalRevenue, 4_999_999 + 3_000_000 + 100_000);
});

test("backward compatible: with no new parameter the repository makes exactly the filter calls it always made", async () => {
  rows = fixture();
  filterCalls.length = 0;
  const { status } = await get(list, "dateFrom=2026-09-01&dateTo=2026-10-01&productCategory=V%C3%B2ng&productCode=SP&minAmount=1&maxAmount=999999999&sortField=sale_date&sortDirection=desc&page=1");
  assert.equal(status, 200);
  // page query and summary query each apply the same set
  const legacy = ["gte:sale_date", "lt:sale_date", "ilike:product_code", "eq:product_category", "gte:sale_amount", "lte:sale_amount"];
  assert.deepEqual(filterCalls, [...legacy, ...legacy]);
  assert.ok(!filterCalls.some((c) => c.startsWith("or:") || c === "eq:product_id" || c === "eq:is_revenue_recognized" || c === "lt:sale_amount"));
});

test("with the new parameters each adds exactly its own filter, in the shared helper (page, summary and export alike)", async () => {
  rows = fixture();
  filterCalls.length = 0;
  await get(list, `productId=${uid(1)}&uncategorized=1&maxAmountExclusive=5000000&recognizedOnly=1`);
  const added = ["eq:product_id", "or:product_category.is.null,product_category.match.^[[:space:]]*$", "lt:sale_amount", "eq:is_revenue_recognized"];
  assert.deepEqual(filterCalls, [...added, ...added]);
});

test("strict validation: a malformed productId or maxAmountExclusive is a 400, never ignored, never passed to the database", async () => {
  rows = fixture();
  for (const q of ["productId=not-a-uuid", `productId=${uid(1)},product_code.ilike.%`, "maxAmountExclusive=abc", "maxAmountExclusive=-5", "maxAmountExclusive="]) {
    filterCalls.length = 0;
    const { status } = await get(list, q);
    assert.equal(status, 400, q);
    assert.deepEqual(filterCalls, [], `${q}: the database was never queried`);
  }
});

test("unknown or operator-looking parameters change nothing: only the whitelisted filters exist", async () => {
  rows = fixture();
  filterCalls.length = 0;
  const { status, body } = await get(list, "evil=1&select=*&or=(sale_amount.gt.0)&sale_amount=gt.0&is_revenue_recognized=eq.false&uncategorized=yes&recognizedOnly=0");
  assert.equal(status, 200);
  assert.deepEqual(filterCalls, []);
  assert.equal(body.totalCount, rows.length, "no filter applied at all");
});

test("a hostile category value is a plain value of one equality filter, never a filter expression", async () => {
  rows = fixture();
  filterCalls.length = 0;
  const { status, body } = await get(list, `productCategory=${encodeURIComponent("Vòng,sale_amount.gt.0")}`);
  assert.equal(status, 200);
  assert.deepEqual(filterCalls, ["eq:product_category", "eq:product_category"]);
  assert.equal(body.totalCount, 0, "matches no category literally named like that");
});

test("the export route applies the same filters (so Export after a drill-down exports what is on screen) and validates them too", async () => {
  rows = fixture();
  const dash = await get(exportRoute, `recognizedOnly=1&productId=${uid(1)}`, "api/sales-ledger/export");
  assert.equal(permissionKey, "reports.export");
  assert.equal(dash.status, 200);
  assert.deepEqual(dash.body.rows.map((r: { purchase_id: string }) => r.purchase_id).sort(), ["r1", "r10", "r2"]);
  assert.equal((await get(exportRoute, "productId=zzz", "api/sales-ledger/export")).status, 400);
});
