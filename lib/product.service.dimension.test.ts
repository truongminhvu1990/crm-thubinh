import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Ni-Chột-Dày at the service boundary (PO spec 2026-10-04): the server-side
 * half of the rule must not rely on the form. Covers addProduct,
 * updateProduct and bulkAddProducts, and proves products.size stays an
 * independent, untouched field.
 *
 * Same mock.module-once-at-file-scope pattern as
 * lib/product.service.deleteProduct.test.ts.
 */
interface Existing {
  category: string | null;
  status: string | null;
  dimension_ni_mm: number | null;
  dimension_chot_mm: number | null;
  dimension_day_mm: number | null;
}

const inserted: Record<string, unknown>[][] = [];
const updated: { id: string; row: Record<string, unknown> }[] = [];
let existing: Existing | null = null;

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table !== "products") throw new Error(`Unexpected table in test: ${table}`);
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existing, error: null }) }) }),
          insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
            const list = Array.isArray(rows) ? rows : [rows];
            inserted.push(list);
            return { select: () => ({ single: () => Promise.resolve({ data: list[0], error: null }), then: (r: (v: unknown) => unknown) => r({ data: list, error: null }) }) };
          },
          update: (row: Record<string, unknown>) => ({
            eq: (_c: string, id: string) => {
              updated.push({ id, row });
              return { select: () => ({ single: () => Promise.resolve({ data: { id, ...row }, error: null }) }) };
            },
          }),
        };
      },
    },
  },
});
mock.module("@/lib/auditLog.service", { namedExports: { logStatusChange: async () => {} } });

test.beforeEach(() => {
  inserted.length = 0;
  updated.length = 0;
  existing = null;
});

const OK_DIM = { dimension_ni_mm: 54.5, dimension_chot_mm: 9.4, dimension_day_mm: 6.6 };

// ---------- addProduct ----------

test("addProduct: Available Vòng without Ni-Chột-Dày is rejected and nothing is inserted", async () => {
  const { addProduct } = await import("./product.service");
  const r = await addProduct({ product_code: "V1", product_name: "V", category: "Vòng", status: "Available" });
  assert.ok(r.error);
  assert.equal(r.data, null);
  assert.equal(inserted.length, 0);
});

test("addProduct: Available Nhẫn with a partial value is rejected", async () => {
  const { addProduct } = await import("./product.service");
  const r = await addProduct({ product_code: "N1", product_name: "N", category: "Nhẫn", status: "Available", dimension_ni_mm: 17, dimension_chot_mm: 5 });
  assert.ok(r.error);
  assert.equal(inserted.length, 0);
});

test("addProduct: Available Vòng with all three is written, including decimals", async () => {
  const { addProduct } = await import("./product.service");
  const r = await addProduct({ product_code: "V2", product_name: "V", category: "Vòng", status: "Available", ...OK_DIM });
  assert.equal(r.error, null);
  assert.equal(inserted[0][0].dimension_ni_mm, 54.5);
  assert.equal(inserted[0][0].dimension_chot_mm, 9.4);
  assert.equal(inserted[0][0].dimension_day_mm, 6.6);
});

test("addProduct: the UI-only dimension_input is never written", async () => {
  const { addProduct } = await import("./product.service");
  await addProduct({ product_code: "V3", product_name: "V", category: "Vòng", status: "Available", ...OK_DIM, dimension_input: "54.5-9.4-6.6" });
  assert.equal("dimension_input" in inserted[0][0], false);
});

test("addProduct: a malformed typed value is rejected even for a non-Available Vòng", async () => {
  const { addProduct } = await import("./product.service");
  const r = await addProduct({ product_code: "V4", product_name: "V", category: "Vòng", status: "Sold", dimension_input: "54.55-9-6" });
  assert.ok(r.error);
  assert.equal(inserted.length, 0);
});

for (const status of ["Paused", "Reserved", "Sold", "Discontinued", "Archived"]) {
  test(`addProduct: ${status} Vòng does not require Ni-Chột-Dày`, async () => {
    const { addProduct } = await import("./product.service");
    const r = await addProduct({ product_code: `S-${status}`, product_name: "V", category: "Vòng", status });
    assert.equal(r.error, null);
    assert.equal(inserted.length, 1);
  });
}

test("addProduct: non-target category neither requires nor writes the dimension", async () => {
  const { addProduct } = await import("./product.service");
  const r = await addProduct({ product_code: "C1", product_name: "Chuỗi", category: "Chuỗi", status: "Available", ...OK_DIM });
  assert.equal(r.error, null);
  const row = inserted[0][0];
  assert.equal("dimension_ni_mm" in row, false);
  assert.equal("dimension_chot_mm" in row, false);
  assert.equal("dimension_day_mm" in row, false);
});

test("addProduct: no category at all (Available) is not validated", async () => {
  const { addProduct } = await import("./product.service");
  const r = await addProduct({ product_code: "X1", product_name: "X", status: "Available" });
  assert.equal(r.error, null);
});

test("addProduct: legacy size is written unchanged and independent of the dimension", async () => {
  const { addProduct } = await import("./product.service");
  await addProduct({ product_code: "C2", product_name: "Chuỗi", category: "Chuỗi", status: "Available", size: 17.5 });
  assert.equal(inserted[0][0].size, 17.5);
  await addProduct({ product_code: "V5", product_name: "V", category: "Vòng", status: "Available", size: 17.5, ...OK_DIM });
  assert.equal(inserted[1][0].size, 17.5);
  assert.equal(inserted[1][0].dimension_ni_mm, 54.5); // size was NOT copied into Ni
});

// ---------- updateProduct ----------

test("updateProduct: saving an Available Vòng that has no dimension is rejected (full payload)", async () => {
  const { updateProduct } = await import("./product.service");
  const r = await updateProduct("id-1", { product_code: "V", product_name: "V", category: "Vòng", status: "Available", sale_price: 100 });
  assert.ok(r.error);
  assert.equal(updated.length, 0);
});

test("updateProduct: completing the dimension on an Available Vòng saves it", async () => {
  const { updateProduct } = await import("./product.service");
  const r = await updateProduct("id-1", { product_code: "V", product_name: "V", category: "Vòng", status: "Available", ...OK_DIM });
  assert.equal(r.error, null);
  assert.equal(updated[0].row.dimension_day_mm, 6.6);
});

test("updateProduct: a partial payload cannot dodge the rule - stored category/status apply", async () => {
  existing = { category: "Vòng", status: "Available", dimension_ni_mm: null, dimension_chot_mm: null, dimension_day_mm: null };
  const { updateProduct } = await import("./product.service");
  const r = await updateProduct("id-1", { sale_price: 5 });
  assert.ok(r.error);
  assert.equal(updated.length, 0);
});

test("updateProduct: partial payload on a product that already has all three is fine", async () => {
  existing = { category: "Nhẫn", status: "Available", dimension_ni_mm: 17, dimension_chot_mm: 5.1, dimension_day_mm: 5.2 };
  const { updateProduct } = await import("./product.service");
  const r = await updateProduct("id-1", { sale_price: 5 });
  assert.equal(r.error, null);
  assert.deepEqual(updated[0].row, { sale_price: 5 });
});

test("updateProduct: non-Available Vòng is untouched by the rule", async () => {
  existing = { category: "Vòng", status: "Sold", dimension_ni_mm: null, dimension_chot_mm: null, dimension_day_mm: null };
  const { updateProduct } = await import("./product.service");
  const r = await updateProduct("id-1", { sale_price: 5 });
  assert.equal(r.error, null);
});

test("updateProduct: clearing the dimension (nulls) is allowed for a non-Available product", async () => {
  const { updateProduct } = await import("./product.service");
  const r = await updateProduct("id-1", {
    category: "Vòng", status: "Paused", dimension_ni_mm: null, dimension_chot_mm: null, dimension_day_mm: null, dimension_input: "",
  });
  assert.equal(r.error, null);
  assert.equal(updated[0].row.dimension_ni_mm, null);
});

test("updateProduct: moving an existing product into Available without a dimension is rejected", async () => {
  existing = { category: "Vòng", status: "Paused", dimension_ni_mm: null, dimension_chot_mm: null, dimension_day_mm: null };
  const { updateProduct } = await import("./product.service");
  const r = await updateProduct("id-1", { status: "Available" });
  assert.ok(r.error);
});

test("updateProduct: switching to a non-target category drops the dimension from the write", async () => {
  const { updateProduct } = await import("./product.service");
  await updateProduct("id-1", { category: "Chuỗi", status: "Available", ...OK_DIM, size: 12 });
  assert.equal("dimension_ni_mm" in updated[0].row, false);
  assert.equal(updated[0].row.size, 12);
});

// ---------- bulkAddProducts ----------

test("bulkAddProducts: one incomplete Available Vòng/Nhẫn row rejects the batch before any insert", async () => {
  const { bulkAddProducts } = await import("./product.service");
  const r = await bulkAddProducts([
    { product_code: "B1", product_name: "ok", category: "Chuỗi", status: "Available" },
    { product_code: "B2", product_name: "bad", category: "Nhẫn", status: "Available" },
  ]);
  assert.ok(r.error);
  assert.equal(inserted.length, 0);
});

test("bulkAddProducts: old-style rows (no dimension columns, other categories / non-Available) still import", async () => {
  const { bulkAddProducts } = await import("./product.service");
  const r = await bulkAddProducts([
    { product_code: "B3", product_name: "x", category: "Chuỗi", status: "Available", size: 15 },
    { product_code: "B4", product_name: "y", category: "Vòng", status: "Sold" },
  ]);
  assert.equal(r.error, null);
  assert.equal(inserted[0].length, 2);
});

test("bulkAddProducts: a complete Available Vòng row imports with its three values", async () => {
  const { bulkAddProducts } = await import("./product.service");
  const r = await bulkAddProducts([{ product_code: "B5", product_name: "z", category: "Vòng", status: "Available", ...OK_DIM }]);
  assert.equal(r.error, null);
  assert.equal(inserted[0][0].dimension_chot_mm, 9.4);
});
