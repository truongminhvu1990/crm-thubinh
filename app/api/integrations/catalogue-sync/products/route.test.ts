import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest } from "next/server";

/**
 * Mini Catalogue -> CRM inventory sync (V1) integration surface. See the
 * route file for the locked contract this proves: token auth (fail closed
 * when unconfigured, 401 when wrong/missing), and a strict 4-field
 * whitelist projection that never leaks internal columns.
 */

const PRODUCTS = [
  { id: "11111111-1111-1111-1111-111111111111", product_code: "P-001", product_name: "Vòng cẩm thạch A", status: "Available", cost_price: 5_000_000, supplier: "Supplier X", location: "Kho A", salesperson: "staff-1", source: "wholesale", notes: "internal note" },
  { id: "22222222-2222-2222-2222-222222222222", product_code: "P-002", product_name: "Vòng cẩm thạch B", status: "SomeUnrecognizedStatus", cost_price: 1_000_000, supplier: "Supplier Y", location: "Kho B", salesperson: "staff-2", source: "consignment", notes: "another note" },
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

test("200s with the correct token and returns only the 4 whitelisted fields per product - no cost_price/supplier/location/salesperson/source/notes", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.products.length, 2);
  for (const p of body.products) {
    assert.deepEqual(Object.keys(p).sort(), ["id", "name", "product_code", "status"]);
  }
  assert.equal(body.products[0].id, PRODUCTS[0].id);
  assert.equal(body.products[0].product_code, PRODUCTS[0].product_code);
  assert.equal(body.products[0].name, PRODUCTS[0].product_name);
  assert.equal(body.products[0].status, PRODUCTS[0].status);
  const raw = JSON.stringify(body);
  for (const leaked of ["cost_price", "5000000", "Supplier X", "Kho A", "staff-1", "wholesale", "internal note"]) {
    assert.ok(!raw.includes(leaked), `response must not leak ${leaked}`);
  }
});

test("an unrecognized/garbage status string is passed through verbatim, not rejected or coerced", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  const body = await res.json();
  assert.equal(body.products[1].status, "SomeUnrecognizedStatus");
});

test("only the 4 whitelisted columns are ever requested from the database (never select(\"*\"))", async () => {
  await GET(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(selectedColumns, "id, product_code, product_name, status");
});

test("the response disables caching so a poll always sees fresh state", async () => {
  const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
  assert.equal(res.headers.get("cache-control"), "no-store");
});
