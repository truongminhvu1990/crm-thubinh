import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Product-Level Status, D1-D10 Test Plan — Case 6 & Case 10.
 * Status literals updated for BR-003 (LOCKED, 2026-08-21) - "Returned"
 * retired in favor of "Archived", "Active" retired in favor of
 * "Available"; returned_at remains the source of truth for the
 * supplier-return fact regardless.
 *
 * Case 6: Return action sets both status='Archived' AND returned_at in
 * the same UPDATE.
 * Case 10: a valid status transition (here: Available -> Archived) writes
 * one audit_log entry via logStatusChange, with the correct before/after.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * reasoning as lib/orders/order.repository.completeOrder.test.ts.
 */
interface UpdatePayload {
  status: string;
  returned_at: string;
}

let previousStatus: string | null = "Available";
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
  previousStatus = "Available";
  guardMatches = true;
  capturedUpdates.length = 0;
  loggedCalls.length = 0;
});

test("Case 6 + Case 10: returnProductToSupplier sets status+returned_at together and logs the transition (BR-003: status = Archived)", async () => {
  previousStatus = "Available";
  guardMatches = true;

  const { returnProductToSupplier } = await import("./product.service");
  const { data, error } = await returnProductToSupplier("product-1", "owner@test.local");

  assert.equal(error, null);
  assert.equal(data?.status, "Archived");
  assert.ok(data?.returned_at, "returned_at must be set");
  assert.equal(capturedUpdates.length, 1);
  assert.equal(capturedUpdates[0].status, "Archived");
  assert.ok(capturedUpdates[0].returned_at, "the single UPDATE call must carry both status and returned_at");

  assert.equal(loggedCalls.length, 1, "exactly one audit_log entry for this transition");
  assert.deepEqual(loggedCalls[0], {
    tableName: "products",
    recordId: "product-1",
    before: "Available",
    after: "Archived",
    actor: "owner@test.local",
  });
});

test("Case 6 edge: Sold product cannot be returned to supplier (guard rejects)", async () => {
  previousStatus = "Sold";
  guardMatches = false;

  const { returnProductToSupplier } = await import("./product.service");
  const { data, error } = await returnProductToSupplier("product-1", null);

  assert.equal(data, null);
  assert.ok(error, "must reject when the product isn't Available/Paused");
  assert.equal(capturedUpdates.length, 0);
});
