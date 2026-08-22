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
 * INV-012 (Orders/RLS reservation-blocker fix, 2026-08-22) — reserveProduct/
 * releaseProduct now call the reserve_product()/release_product() RPCs
 * through whichever client is in play (audit.client when present, the
 * anon-defaulting `supabase` singleton otherwise — exactly the same
 * audit.client reuse this file was already covering, just now also used
 * for the write itself, not only the subsequent audit-log entry).
 * markProductSold is deliberately unchanged in shape — still a direct
 * `.update()`, only the client it runs through differs — so its mock
 * stays exactly as it always was.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as order.repository.completeOrder.test.ts.
 */
let matchingRows: { id: string }[] = [{ id: "product-1" }];
let rpcShouldFindRow = true;

function makeRpcCapableClient(marker: string) {
  return {
    marker,
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
    rpc(fnName: string) {
      if (fnName !== "reserve_product" && fnName !== "release_product") {
        throw new Error(`Unexpected RPC in test: ${fnName}`);
      }
      if (!rpcShouldFindRow) {
        return Promise.resolve({ data: null, error: { code: "P0002", message: "not found" } });
      }
      return Promise.resolve({ data: { id: "product-1" }, error: null });
    },
  };
}

mock.module("@/lib/supabase", {
  namedExports: { supabase: makeRpcCapableClient("default-anon-singleton") },
});

const loggedCalls: { input: unknown; client: unknown }[] = [];
const fakeAuthedClient = makeRpcCapableClient("fake-authenticated-client");

mock.module("@/lib/auditLog.service", {
  namedExports: {
    logStatusChange: async (input: unknown, client: unknown) => {
      loggedCalls.push({ input, client });
    },
  },
});

test.beforeEach(() => {
  matchingRows = [{ id: "product-1" }];
  rpcShouldFindRow = true;
  loggedCalls.length = 0;
});

test("reserveProduct: with audit context, logs Available->Reserved via the given client (BR-003)", async () => {
  const { reserveProduct } = await import("./order.repository");
  await reserveProduct("product-1", { actor: "owner@test.local", client: fakeAuthedClient as never });

  assert.equal(loggedCalls.length, 1);
  assert.deepEqual(loggedCalls[0].input, {
    tableName: "products",
    recordId: "product-1",
    before: "Available",
    after: "Reserved",
    actor: "owner@test.local",
  });
  assert.equal(loggedCalls[0].client, fakeAuthedClient, "must use the passed-in authenticated client, not the default");
});

test("reserveProduct: without audit context, no insert is attempted (never actor=null) - action still completes", async () => {
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

test("releaseProduct: with audit context, logs Reserved->Available (BR-003)", async () => {
  const { releaseProduct } = await import("./order.repository");
  await releaseProduct("product-1", { actor: "owner@test.local", client: fakeAuthedClient as never });

  assert.equal(loggedCalls.length, 1);
  assert.deepEqual(loggedCalls[0].input, {
    tableName: "products",
    recordId: "product-1",
    before: "Reserved",
    after: "Available",
    actor: "owner@test.local",
  });
});

test("releaseProduct: without audit context, no insert is attempted", async () => {
  const { releaseProduct } = await import("./order.repository");
  await assert.doesNotReject(() => releaseProduct("product-1"));
  assert.equal(loggedCalls.length, 0);
});
