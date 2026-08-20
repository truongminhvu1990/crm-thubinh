import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Product-Level Status, D5 completion (Product Owner Authorization,
 * 2026-08-19) — regression coverage for the actor/session propagation
 * wiring itself (fast/mocked complement to the real Dev DB verification
 * already run for Cases A/B/C). Covers reserveProduct/releaseProduct/
 * markProductSold: with an OrderAuditContext, logStatusChange is called
 * with the given client + correct before/after; without one, NO insert is
 * attempted (never actor=null) and the status transition still completes.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as order.repository.completeOrder.test.ts.
 */
let matchingRows: { id: string }[] = [{ id: "product-1" }];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      from(table: string) {
        if (table !== "products") throw new Error(`Unexpected table in test: ${table}`);
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => Promise.resolve({ data: matchingRows, error: null }),
              }),
            }),
          }),
        };
      },
    },
  },
});

const loggedCalls: { input: unknown; client: unknown }[] = [];
const fakeAuthedClient = { marker: "fake-authenticated-client" };

mock.module("@/lib/auditLog.service", {
  namedExports: {
    logStatusChange: async (input: unknown, client: unknown) => {
      loggedCalls.push({ input, client });
    },
  },
});

test.beforeEach(() => {
  matchingRows = [{ id: "product-1" }];
  loggedCalls.length = 0;
});

test("reserveProduct: with audit context, logs Active->Reserved via the given client", async () => {
  const { reserveProduct } = await import("./order.repository");
  await reserveProduct("product-1", { actor: "owner@test.local", client: fakeAuthedClient as never });

  assert.equal(loggedCalls.length, 1);
  assert.deepEqual(loggedCalls[0].input, {
    tableName: "products",
    recordId: "product-1",
    before: "Active",
    after: "Reserved",
    actor: "owner@test.local",
  });
  assert.equal(loggedCalls[0].client, fakeAuthedClient, "must use the passed-in authenticated client, not the default");
});

test("reserveProduct: without audit context, no insert is attempted (never actor=null) - action still completes", async () => {
  matchingRows = [{ id: "product-1" }];
  const { reserveProduct } = await import("./order.repository");

  await assert.doesNotReject(() => reserveProduct("product-1"));
  assert.equal(loggedCalls.length, 0, "must never attempt a null-actor insert");
});

test("markProductSold: with audit context, logs Reserved->Sold", async () => {
  const { markProductSold } = await import("./order.repository");
  await markProductSold("product-1", { actor: "owner@test.local", client: fakeAuthedClient as never });

  assert.equal(loggedCalls.length, 1);
  assert.deepEqual(loggedCalls[0].input, {
    tableName: "products",
    recordId: "product-1",
    before: "Reserved",
    after: "Sold",
    actor: "owner@test.local",
  });
});

test("markProductSold: 0 rows matched (already not Reserved) - no audit entry for a transition that didn't happen", async () => {
  matchingRows = [];
  const { markProductSold } = await import("./order.repository");
  await markProductSold("product-1", { actor: "owner@test.local", client: fakeAuthedClient as never });

  assert.equal(loggedCalls.length, 0);
});

test("releaseProduct: with audit context, logs Reserved->Active", async () => {
  const { releaseProduct } = await import("./order.repository");
  await releaseProduct("product-1", { actor: "owner@test.local", client: fakeAuthedClient as never });

  assert.equal(loggedCalls.length, 1);
  assert.deepEqual(loggedCalls[0].input, {
    tableName: "products",
    recordId: "product-1",
    before: "Reserved",
    after: "Active",
    actor: "owner@test.local",
  });
});

test("releaseProduct: without audit context, no insert is attempted", async () => {
  const { releaseProduct } = await import("./order.repository");
  await assert.doesNotReject(() => releaseProduct("product-1"));
  assert.equal(loggedCalls.length, 0);
});
