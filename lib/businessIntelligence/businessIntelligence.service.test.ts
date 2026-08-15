import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// businessIntelligence.service.ts imports "@/lib/supabase" (a real client,
// throws without env vars) only as the default parameter value - every
// call below injects its own fake client instead, same dependency
// injection pattern already used throughout this codebase's own
// `client: SupabaseClient = supabase` functions.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakeProductRow {
  id: string;
  status: string;
  sale_price: number;
}

/** Minimal fake covering exactly the one call getInventoryAnalytics makes
 * (`client.from("products").select("id, status, sale_price")`), resolved
 * directly since Supabase's own query builder is thenable and this
 * function `await`s the `.select(...)` call with no further chaining. */
function fakeClient(products: FakeProductRow[]) {
  return {
    from: (table: string) => {
      assert.equal(table, "products");
      return {
        select: async () => ({ data: products, error: null }),
      };
    },
  } as never;
}

function product(id: string, status: string, sale_price = 1_000_000): FakeProductRow {
  return { id, status, sale_price };
}

test("getInventoryAnalytics: Product Status Standardization - Sold products counted correctly, not conflated with Available/Reserved", async () => {
  const { getInventoryAnalytics } = await import("./businessIntelligence.service");

  const client = fakeClient([
    product("p1", "Available"),
    product("p2", "Available"),
    product("p3", "Reserved"),
    product("p4", "Sold"),
    product("p5", "Sold"),
    product("p6", "Sold"),
    product("p7", "Archived"),
  ]);

  const result = await getInventoryAnalytics(client);

  assert.equal(result.productsSold, 3, "3 Sold rows must count as exactly 3, unaffected by other statuses");
  assert.equal(result.productsAvailable, 2, "Products Available = COUNT WHERE status = 'Available' only, per docs/18_BUSINESS_INTELLIGENCE_SPEC.md");
  assert.equal(result.productsReserved, 1, "Products Reserved = COUNT WHERE status = 'Reserved', read directly (no order_items join needed now)");
});

test("getInventoryAnalytics: Inventory Value sums Available + Reserved, excludes Sold and Archived", async () => {
  const { getInventoryAnalytics } = await import("./businessIntelligence.service");

  const client = fakeClient([
    product("p1", "Available", 5_000_000),
    product("p2", "Reserved", 3_000_000),
    product("p3", "Sold", 10_000_000),
    product("p4", "Archived", 2_000_000),
  ]);

  const result = await getInventoryAnalytics(client);

  assert.equal(result.inventoryValue, 8_000_000, "Decision 1: SUM(Base Price) WHERE status IN (Available, Reserved) only");
});

test("getInventoryAnalytics: empty inventory produces all-zero result, not an error", async () => {
  const { getInventoryAnalytics } = await import("./businessIntelligence.service");

  const result = await getInventoryAnalytics(fakeClient([]));

  assert.deepEqual(result, { inventoryValue: 0, productsAvailable: 0, productsReserved: 0, productsSold: 0 });
});
