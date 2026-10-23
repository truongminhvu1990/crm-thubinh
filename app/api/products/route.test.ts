import test, { before, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

/**
 * GET /api/products: a failed query must never look like a valid empty list. The route runs against the real
 * product.service with a recording fake Supabase client (no database, no network); only createClient() and the
 * module-level browser client are mocked.
 */

type QueryResult = { data: unknown; error: unknown };
type Scripted = QueryResult | { throws: Error };

/** One scripted result per query the code issues (the last one repeats). */
function makeClient(results: Scripted[]) {
  let issued = 0;
  return {
    from() {
      return {
        select() {
          const result = results[issued++] ?? results[results.length - 1];
          const builder = {
            or: () => builder,
            eq: () => builder,
            order: () => builder,
            then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
              ("throws" in result ? Promise.reject(result.throws) : Promise.resolve(result)).then(resolve, reject),
          };
          return builder;
        },
      };
    },
  };
}

const SECRET = "SECRET-INTERNAL-DETAIL";
const queryError = { code: "PGRST200", message: SECRET, details: SECRET, hint: SECRET };
const FILTERS = "search=SECRET-SEARCH&category=SECRET-CATEGORY&status=SECRET-STATUS";
const EXPECTED_BODY = { error: { code: "PRODUCTS_QUERY_FAILED", message: "Không tải được danh sách sản phẩm." } };
const p1 = { id: "p1", product_name: "Product 1" };

let createClientImpl: () => Promise<unknown>;
let GET: typeof import("./route").GET;
let errorSpy: { mock: { calls: { arguments: unknown[] }[]; restore(): void } };

before(async () => {
  mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
  mock.module("@/lib/supabase/server", { namedExports: { createClient: () => createClientImpl() } });
  ({ GET } = await import("./route"));
});

beforeEach(() => {
  createClientImpl = async () => makeClient([{ data: [p1], error: null }]);
  errorSpy = mock.method(console, "error", () => {}) as unknown as typeof errorSpy;
});

afterEach(() => {
  errorSpy.mock.restore();
});

const request = (query = "") => new NextRequest(`http://localhost/api/products${query ? `?${query}` : ""}`);

test("query succeeds with products: 200 and the array", async () => {
  const res = await GET(request());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [p1]);
  assert.equal(errorSpy.mock.calls.length, 0);
});

test("query succeeds with no products: 200 and []", async () => {
  createClientImpl = async () => makeClient([{ data: [], error: null }]);
  const res = await GET(request());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
  assert.equal(errorSpy.mock.calls.length, 0);
});

test("join query fails but the fallback succeeds: 200 and the fallback rows", async () => {
  createClientImpl = async () =>
    makeClient([
      { data: null, error: queryError },
      { data: [p1], error: null },
    ]);
  const res = await GET(request());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), [p1]);
  assert.equal(errorSpy.mock.calls.length, 0);
});

test("both queries fail: 500 with exactly the fixed error body, never 200 with []", async () => {
  createClientImpl = async () =>
    makeClient([
      { data: null, error: queryError },
      { data: null, error: queryError },
    ]);
  const res = await GET(request(FILTERS));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.deepEqual(body, EXPECTED_BODY);
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.deepEqual(Object.keys(body.error), ["code", "message"]);
  assert.ok(!JSON.stringify(body).includes(SECRET));
});

test("createClient() throws: 500 with the same fixed error body", async () => {
  createClientImpl = async () => {
    throw new Error(SECRET);
  };
  const res = await GET(request(FILTERS));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.deepEqual(body, EXPECTED_BODY);
  assert.ok(!JSON.stringify(body).includes(SECRET));
});

test("new route logging is fixed text and a fixed stage only", async () => {
  // Query failure, then createClient() failure; both carry request filters and error text that must never be logged.
  createClientImpl = async () =>
    makeClient([
      { data: null, error: queryError },
      { data: null, error: queryError },
    ]);
  await GET(request(FILTERS));
  createClientImpl = async () => {
    throw new Error(SECRET);
  };
  await GET(request(FILTERS));

  assert.equal(errorSpy.mock.calls.length, 2);
  assert.deepEqual(errorSpy.mock.calls[0].arguments, ["Products API: failed to load products", { stage: "query" }]);
  assert.deepEqual(errorSpy.mock.calls[1].arguments, ["Products API: failed to load products", { stage: "client" }]);
  for (const call of errorSpy.mock.calls) {
    const logged = JSON.stringify(call.arguments);
    assert.ok(!logged.includes("SECRET"), `log must not contain request or error text: ${logged}`);
  }
});

test("an exception outside the two handled cases is not handled by the route: it propagates and nothing is logged", async () => {
  createClientImpl = async () => makeClient([{ throws: new TypeError(SECRET) }]);
  await assert.rejects(
    GET(request()),
    (error: unknown) => error instanceof TypeError && error.message === SECRET
  );
  assert.equal(errorSpy.mock.calls.length, 0);
});
