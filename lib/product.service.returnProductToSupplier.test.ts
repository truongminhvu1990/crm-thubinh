import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Product-Level Status, D1-D10 Test Plan — Case 6 & Case 10.
 *
 * Case 6: Return action sets both status='Returned' AND returned_at in the
 * same UPDATE.
 * Case 10: a valid status transition (here: Remaining -> Returned) writes
 * one audit_log entry via logStatusChange, with the correct before/after.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * reasoning as lib/orders/order.repository.completeOrder.test.ts.
 */
interface UpdatePayload {
  status: string;
  returned_at: string;
}

let previousStatus: string | null = "Active";
let guardMatches = true;
const capturedUpdates: UpdatePayload[] = [];
const loggedCalls: unknown[] = [];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table !== "products") throw new Error(`Unexpected table in test: ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { status: previousStatus }, error: null }),
            }),
          }),
          update: (payload: UpdatePayload) => ({
            eq: () => ({
              in: () => ({
                select: () => ({
                  single: () => {
                    if (!guardMatches) {
                      return Promise.resolve({ data: null, error: { code: "PGRST116", message: "no rows" } });
                    }
                    capturedUpdates.push(payload);
                    return Promise.resolve({ data: { id: "product-1", ...payload }, error: null });
                  },
                }),
              }),
            }),
          }),
        };
      },
    },
  },
});

mock.module("@/lib/auditLog.service", {
  namedExports: {
    logStatusChange: async (input: unknown) => {
      loggedCalls.push(input);
    },
  },
});

test.beforeEach(() => {
  previousStatus = "Active";
  guardMatches = true;
  capturedUpdates.length = 0;
  loggedCalls.length = 0;
});

test("Case 6 + Case 10: returnProductToSupplier sets status+returned_at together and logs the transition", async () => {
  previousStatus = "Active";
  guardMatches = true;

  const { returnProductToSupplier } = await import("./product.service");
  const { data, error } = await returnProductToSupplier("product-1", "owner@test.local");

  assert.equal(error, null);
  assert.equal(data?.status, "Returned");
  assert.ok(data?.returned_at, "returned_at must be set");
  assert.equal(capturedUpdates.length, 1);
  assert.equal(capturedUpdates[0].status, "Returned");
  assert.ok(capturedUpdates[0].returned_at, "the single UPDATE call must carry both status and returned_at");

  assert.equal(loggedCalls.length, 1, "exactly one audit_log entry for this transition");
  assert.deepEqual(loggedCalls[0], {
    tableName: "products",
    recordId: "product-1",
    before: "Active",
    after: "Returned",
    actor: "owner@test.local",
  });
});

test("Case 6 edge: Sold product cannot be returned to supplier (guard rejects)", async () => {
  previousStatus = "Sold";
  guardMatches = false;

  const { returnProductToSupplier } = await import("./product.service");
  const { data, error } = await returnProductToSupplier("product-1", null);

  assert.equal(data, null);
  assert.ok(error, "must reject when the product isn't Active/Paused");
  assert.equal(capturedUpdates.length, 0);
});
