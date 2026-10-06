import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest } from "next/server";

/**
 * Mini Catalogue -> CRM inventory sync (V1) integration surface. See the
 * route file for the locked contract this proves: token auth (fail closed
 * when unconfigured, 401 when wrong/missing), and a strict whitelist
 * projection (the V1 product_code / product_name / status plus the additive
 * dimensions / color / jade_grade / sale_price) that never leaks internal columns or cost_price.
 */

const PRODUCTS: Record<string, unknown>[] = [
  { id: "11111111-1111-1111-1111-111111111111", product_code: "P-001", product_name: "Vòng cẩm thạch A", status: "Available", dimension_ni_mm: 54.5, dimension_chot_mm: 9.4, dimension_day_mm: 6.6, color: "Hoàng phỉ", jade_grade: "Băng", sale_price: 12_000_000, cost_price: 5_000_000, supplier: "Supplier X", location: "Kho A", salesperson: "staff-1", source: "wholesale", notes: "internal note" },
  { id: "22222222-2222-2222-2222-222222222222", product_code: "P-002", product_name: "Vòng cẩm thạch B", status: "SomeUnrecognizedStatus", dimension_ni_mm: null, dimension_chot_mm: null, dimension_day_mm: null, color: null, jade_grade: null, sale_price: 2_000_000, cost_price: 1_000_000, supplier: "Supplier Y", location: "Kho B", salesperson: "staff-2", source: "consignment", notes: "another note" },
];

let selectedColumns = "";
let GET: typeof import("./route").GET;

before(async () => {
  mock.module("@/lib/supabase/admin", {
    namedExports: {
      AdminClientConfigError: class AdminClientConfigError extends Error {},
      createAdminClient: () => ({
        from: (table: string) => {
          assert.equal(table, "products");
          return {
            select: (columns: string) => {
              selectedColumns = columns;
              return {
                returns: () => Promise.resolve({ data: PRODUCTS, error: null }),
              };
            },
          };
        },
      }),
    },
  });
  const mod = await import("./route");
  GET = mod.GET;
});

const TOKEN = "test-shared-secret-token-value";

beforeEach(() => {
  process.env.CATALOGUE_SYNC_TOKEN = TOKEN;
  selectedColumns = "";
});

afterEach(() => {
  delete process.env.CATALOGUE_SYNC_TOKEN;
});

function req(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/integrations/catalogue-sync/products", { headers });
}

test("500s fail-closed when CATALOGUE_SYNC_TOKEN is not configured, even with a token presented", async () => {
  delete process.env.CATALOGUE_SYNC_TOKEN;
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(res.status, 500);
});

test("401s with no Authorization header", async () => {
  const res = await GET(req());
  assert.equal(res.status, 401);
});

test("401s with a wrong bearer token", async () => {
  const res = await GET(req({ authorization: "Bearer not-the-right-token" }));
  assert.equal(res.status, 401);
});

test("401s with a non-Bearer scheme", async () => {
  const res = await GET(req({ authorization: `Basic ${TOKEN}` }));
  assert.equal(res.status, 401);
});

test("200s with the correct token and returns only the 7 whitelisted fields per product - no cost_price/supplier/location/salesperson/source/notes", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), "top-level body must be an array, not a { products } wrapper");
  assert.equal(body.length, 2);
  for (const p of body) {
    assert.deepEqual(Object.keys(p).sort(), ["color", "dimensions", "jade_grade", "product_code", "product_name", "sale_price", "status"]);
  }
  assert.equal(body[0].product_code, PRODUCTS[0].product_code);
  assert.equal(body[0].product_name, PRODUCTS[0].product_name);
  assert.equal(body[0].status, PRODUCTS[0].status);
  const raw = JSON.stringify(body);
  for (const leaked of ["cost_price", "5000000", "Supplier X", "Kho A", "staff-1", "wholesale", "internal note"]) {
    assert.ok(!raw.includes(leaked), `response must not leak ${leaked}`);
  }
});

test("an unrecognized/garbage status string is passed through verbatim, not rejected or coerced", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  const body = await res.json();
  assert.equal(body[1].status, "SomeUnrecognizedStatus");
});

test("only the whitelisted columns are ever requested from the database (never select(\"*\")) - no cost_price", async () => {
  await GET(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(selectedColumns, "product_code, product_name, status, dimension_ni_mm, dimension_chot_mm, dimension_day_mm, color, jade_grade, sale_price");
});

test("the response disables caching so a poll always sees fresh state", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(res.headers.get("cache-control"), "no-store");
});

async function bodyFor(row: Record<string, unknown>) {
  const saved = [...PRODUCTS];
  PRODUCTS.splice(0, PRODUCTS.length, { product_code: "D-1", product_name: "Dim", status: "Available", dimension_ni_mm: null, dimension_chot_mm: null, dimension_day_mm: null, color: null, jade_grade: null, sale_price: null, ...row });
  try {
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    return body[0] as Record<string, unknown>;
  } finally {
    PRODUCTS.splice(0, PRODUCTS.length, ...saved);
  }
}

test("dimensions: all three present -> \"Ni-Chột-Dày\" (54.5 / 9.4 / 6.6 -> \"54.5-9.4-6.6\")", async () => {
  assert.equal((await bodyFor({ dimension_ni_mm: 54.5, dimension_chot_mm: 9.4, dimension_day_mm: 6.6 })).dimensions, "54.5-9.4-6.6");
});

test("dimensions: integers print without a decimal point (54 / 10 / 10 -> \"54-10-10\"), the other contract examples too", async () => {
  assert.equal((await bodyFor({ dimension_ni_mm: 54, dimension_chot_mm: 10, dimension_day_mm: 10 })).dimensions, "54-10-10");
  assert.equal((await bodyFor({ dimension_ni_mm: 54.6, dimension_chot_mm: 9, dimension_day_mm: 9 })).dimensions, "54.6-9-9");
  assert.equal((await bodyFor({ dimension_ni_mm: 53.5, dimension_chot_mm: 9.8, dimension_day_mm: 7.7 })).dimensions, "53.5-9.8-7.7");
});

test("dimensions: values are never inferred or rewritten (94 stays 94, 66 stays 66 - no decimal point is inserted)", async () => {
  assert.equal((await bodyFor({ dimension_ni_mm: 54.5, dimension_chot_mm: 94, dimension_day_mm: 66 })).dimensions, "54.5-94-66");
});

test("dimensions: missing Ni -> null (no partial string)", async () => {
  assert.equal((await bodyFor({ dimension_ni_mm: null, dimension_chot_mm: 9.4, dimension_day_mm: 6.6 })).dimensions, null);
});

test("dimensions: missing Chột -> null (no partial string)", async () => {
  assert.equal((await bodyFor({ dimension_ni_mm: 54.5, dimension_chot_mm: null, dimension_day_mm: 6.6 })).dimensions, null);
});

test("dimensions: missing Dày -> null (no partial string)", async () => {
  assert.equal((await bodyFor({ dimension_ni_mm: 54.5, dimension_chot_mm: 9.4, dimension_day_mm: null })).dimensions, null);
});

test("dimensions: none present -> null", async () => {
  assert.equal((await bodyFor({})).dimensions, null);
});

test("color is returned verbatim; null when the CRM has none", async () => {
  assert.equal((await bodyFor({ color: "Hoàng phỉ" })).color, "Hoàng phỉ");
  assert.equal((await bodyFor({ color: "  Xanh lục " })).color, "  Xanh lục ", "no transformation on the CRM side");
  assert.equal((await bodyFor({})).color, null);
});

test("jade_grade is returned verbatim under the CRM field name (not renamed to variety / Chủng); null when none", async () => {
  const row = await bodyFor({ jade_grade: "Băng" });
  assert.equal(row.jade_grade, "Băng");
  assert.ok(!("variety" in row) && !("chung" in row));
  assert.equal((await bodyFor({})).jade_grade, null);
});

test("backward compatible: product_code / product_name / status are unchanged and the body is still a top-level array", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.deepEqual(
    body.map((p: Record<string, unknown>) => [p.product_code, p.product_name, p.status]),
    PRODUCTS.map((p) => [p.product_code, p.product_name, p.status]),
  );
  assert.equal(body[0].dimensions, "54.5-9.4-6.6");
  assert.equal(body[0].color, "Hoàng phỉ");
  assert.equal(body[0].jade_grade, "Băng");
});

test("sale_price is the product SELLING price, returned verbatim as a number; null when the CRM has none", async () => {
  assert.equal((await bodyFor({ sale_price: 24_800_000 })).sale_price, 24_800_000);
  assert.equal((await bodyFor({ sale_price: 1_500_000 })).sale_price, 1_500_000);
  assert.equal((await bodyFor({})).sale_price, null);
  assert.equal((await bodyFor({ sale_price: undefined })).sale_price, null);
});

test("cost_price is never exposed: not as a key, not as a value, and never substituted for the price", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  const body = await res.json();
  const raw = JSON.stringify(body);
  for (const leaked of ["cost_price", "5000000", "1000000"]) assert.ok(!raw.includes(leaked), `must not expose ${leaked}`);
  assert.equal(body[0].sale_price, 12_000_000, "sale_price comes from sale_price, not from cost_price");
  const onlyCost = await bodyFor({ sale_price: null, cost_price: 7_000_000 });
  assert.equal(onlyCost.sale_price, null, "a missing selling price stays null even when a cost exists");
  assert.ok(!("cost_price" in onlyCost));
});
