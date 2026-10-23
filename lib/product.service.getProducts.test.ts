import test, { before, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * getProducts() / getProductsOrThrow() share one query (queryProducts): the join query first, then the join-less
 * fallback. getProducts() must keep behaving exactly as before for its existing callers (a failed query is `[]`,
 * logged with the raw error); getProductsOrThrow() throws a ProductsQueryError instead. The Supabase client is a
 * recording fake - no database, no network.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: { marker: "module-level-default-supabase" } } });

type QueryResult = { data: unknown; error: unknown };
type Scripted = QueryResult | { throws: Error };
type RecordedQuery = { select: string; calls: string[] };

/** One scripted result per query the code issues (the last one repeats). Records the select and each chained call. */
function makeClient(results: Scripted[]) {
  const queries: RecordedQuery[] = [];
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      return {
        select(select: string) {
          const query: RecordedQuery = { select, calls: [] };
          queries.push(query);
          const result = results[queries.length - 1] ?? results[results.length - 1];
          const builder = {
            or: (filter: string) => {
              query.calls.push(`or ${filter}`);
              return builder;
            },
            eq: (column: string, value: string) => {
              query.calls.push(`eq ${column} ${value}`);
              return builder;
            },
            order: (column: string, options: unknown) => {
              query.calls.push(`order ${column} ${JSON.stringify(options)}`);
              return builder;
            },
            then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
              ("throws" in result ? Promise.reject(result.throws) : Promise.resolve(result)).then(resolve, reject),
          };
          return builder;
        },
      };
    },
  };
  return { client: client as never, queries, tables };
}

const p1 = { id: "p1", product_name: "Product 1" };
const p2 = { id: "p2", product_name: "Product 2" };
const SECRET = "SECRET-QUERY-DETAIL";
const queryError = { code: "PGRST200", message: SECRET, details: SECRET, hint: SECRET };

let getProducts: typeof import("./product.service").getProducts;
let getProductsOrThrow: typeof import("./product.service").getProductsOrThrow;
let ProductsQueryError: typeof import("./product.service").ProductsQueryError;
let errorSpy: { mock: { calls: { arguments: unknown[] }[]; restore(): void } };

before(async () => {
  ({ getProducts, getProductsOrThrow, ProductsQueryError } = await import("./product.service"));
});

beforeEach(() => {
  errorSpy = mock.method(console, "error", () => {}) as unknown as typeof errorSpy;
});

afterEach(() => {
  errorSpy.mock.restore();
});

test("success with data: both functions return the rows, nothing is logged", async () => {
  const a = makeClient([{ data: [p1, p2], error: null }]);
  assert.deepEqual(await getProducts(undefined, undefined, undefined, a.client), [p1, p2]);
  const b = makeClient([{ data: [p1, p2], error: null }]);
  assert.deepEqual(await getProductsOrThrow(undefined, undefined, undefined, b.client), [p1, p2]);
  assert.equal(errorSpy.mock.calls.length, 0);
});

test("success with no rows: both functions return [] without throwing or logging", async () => {
  const a = makeClient([{ data: [], error: null }]);
  assert.deepEqual(await getProducts(undefined, undefined, undefined, a.client), []);
  const b = makeClient([{ data: [], error: null }]);
  assert.deepEqual(await getProductsOrThrow(undefined, undefined, undefined, b.client), []);
  assert.equal(errorSpy.mock.calls.length, 0);
});

test("join query fails but the fallback succeeds: both functions return the fallback rows, in that order, unlogged", async () => {
  for (const call of [getProducts, getProductsOrThrow]) {
    const { client, queries, tables } = makeClient([
      { data: null, error: queryError },
      { data: [p1], error: null },
    ]);
    assert.deepEqual(await call(undefined, undefined, undefined, client), [p1]);
    assert.deepEqual(tables, ["products", "products"]);
    assert.equal(queries.length, 2);
    assert.equal(queries[0].select, "*, batch:product_batches(batch_code), images:product_images(id, image_url, sort_order)");
    assert.equal(queries[1].select, "*");
  }
  assert.equal(errorSpy.mock.calls.length, 0);
});

test("both queries fail: getProducts() still returns [] and logs the raw error exactly once", async () => {
  const { client, queries } = makeClient([
    { data: null, error: queryError },
    { data: null, error: queryError },
  ]);

  assert.deepEqual(await getProducts(undefined, undefined, undefined, client), []);

  assert.equal(queries.length, 2);
  assert.equal(errorSpy.mock.calls.length, 1);
  assert.equal(errorSpy.mock.calls[0].arguments.length, 2);
  assert.equal(errorSpy.mock.calls[0].arguments[0], "Error fetching products:");
  assert.equal(errorSpy.mock.calls[0].arguments[1], queryError);
});

test("both queries fail: getProductsOrThrow() throws a ProductsQueryError and does not log", async () => {
  const { client, queries } = makeClient([
    { data: null, error: queryError },
    { data: null, error: queryError },
  ]);

  await assert.rejects(getProductsOrThrow(undefined, undefined, undefined, client), (error: unknown) => {
    assert.ok(error instanceof ProductsQueryError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, "ProductsQueryError");
    return true;
  });

  assert.equal(queries.length, 2);
  assert.equal(errorSpy.mock.calls.length, 0);
});

test("ProductsQueryError carries nothing from the underlying error", async () => {
  const { client } = makeClient([{ data: null, error: queryError }]);
  const error = (await getProductsOrThrow(undefined, undefined, undefined, client).catch((e: unknown) => e)) as Error;

  assert.ok(error instanceof ProductsQueryError);
  assert.equal(error.message, "Products query failed");
  assert.equal(error.cause, undefined);
  assert.ok(!JSON.stringify(error, Object.getOwnPropertyNames(error)).includes(SECRET));
});

test("filters and ordering are applied identically by both functions", async () => {
  const expected = [
    "or product_name.ilike.%jade%,product_code.ilike.%jade%,sku.ilike.%jade%",
    "eq category Vong",
    "eq status Available",
    'order created_at {"ascending":false}',
  ];
  for (const call of [getProducts, getProductsOrThrow]) {
    const { client, queries } = makeClient([{ data: [p1], error: null }]);
    await call("jade", "Vong", "Available", client);
    assert.deepEqual(queries[0].calls, expected);
  }

  for (const call of [getProducts, getProductsOrThrow]) {
    const { client, queries } = makeClient([{ data: [p1], error: null }]);
    await call(undefined, undefined, undefined, client);
    assert.deepEqual(queries[0].calls, ['order created_at {"ascending":false}']);
  }
});

test("data and error both null: behavior is unchanged - the null passes straight through", async () => {
  // Characterization only. This case has no specified behavior; the cast is exactly as before.
  const a = makeClient([{ data: null, error: null }]);
  assert.equal(await getProducts(undefined, undefined, undefined, a.client), null);
  const b = makeClient([{ data: null, error: null }]);
  assert.equal(await getProductsOrThrow(undefined, undefined, undefined, b.client), null);
  assert.equal(errorSpy.mock.calls.length, 0);
});
