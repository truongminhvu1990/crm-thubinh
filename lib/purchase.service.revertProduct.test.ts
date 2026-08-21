import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * BR-003 Final Compatibility Cleanup (Product Owner Authorization,
 * 2026-08-21) — revertProduct() (private, exercised via the public
 * deletePurchase()) must restore the reverted product to "Available",
 * not the retired "Active" literal.
 *
 * mock.module() called once at file scope, mutable state per test - same
 * documented reasoning/precedent as
 * lib/purchase.service.getPurchaseForProduct.test.ts. Only "@/lib/supabase"
 * is mocked; supabase.auth.getUser() resolves to no user so
 * getCurrentStaff() short-circuits to null.
 */
interface ProductUpdatePayload {
  status: string;
}

let productStatusBefore: string | null = "Available";
const productUpdates: ProductUpdatePayload[] = [];
const auditLogCalls: unknown[] = [];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: null } }),
      },
      from(table: string) {
        if (table === "customer_purchases") {
          return {
            delete: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          };
        }
        if (table === "products") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { status: productStatusBefore }, error: null }),
              }),
            }),
            update: (payload: ProductUpdatePayload) => {
              productUpdates.push(payload);
              return { eq: () => Promise.resolve({ error: null }) };
            },
          };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  },
});

mock.module("@/lib/auditLog.service", {
  namedExports: {
    logStatusChange: async (input: unknown) => {
      auditLogCalls.push(input);
    },
  },
});

test.beforeEach(() => {
  productStatusBefore = "Available";
  productUpdates.length = 0;
  auditLogCalls.length = 0;
});

test("BR-003: deletePurchase() reverts the product to 'Available' (never the retired 'Active')", async () => {
  const { deletePurchase } = await import("./purchase.service");
  const error = await deletePurchase("purchase-1", "product-1");

  assert.equal(error, null);
  assert.equal(productUpdates.length, 1);
  assert.equal(productUpdates[0].status, "Available");
});

test("BR-003: the revert is audit-logged with after = 'Available'", async () => {
  productStatusBefore = "Sold";
  const { deletePurchase } = await import("./purchase.service");
  await deletePurchase("purchase-1", "product-1");

  assert.equal(auditLogCalls.length, 1);
  assert.deepEqual(auditLogCalls[0], {
    tableName: "products",
    recordId: "product-1",
    before: "Sold",
    after: "Available",
    actor: null,
  });
});

test("BR-003: deletePurchase() with no productId does not touch products at all (existing behavior preserved)", async () => {
  const { deletePurchase } = await import("./purchase.service");
  const error = await deletePurchase("purchase-1", null);

  assert.equal(error, null);
  assert.equal(productUpdates.length, 0);
  assert.equal(auditLogCalls.length, 0);
});
