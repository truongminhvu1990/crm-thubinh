import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Lot Product-Level Status, D1-D10 Test Plan — Case 4: a Returned Product
 * must never become Sold unless a business flow explicitly allows it. The
 * only path to Sold through the Orders module is Active -> Reserved ->
 * Sold, gated by reserveProduct()'s `WHERE status = 'Available'` guard
 * (lib/orders/order.repository.ts) - a Returned product can never pass
 * this gate, so it can never reach Reserved, so it can never reach Sold.
 * This test pins that guard, not the Reserved->Sold step itself (already
 * covered by order.repository.completeOrder.test.ts).
 *
 * INV-012 (Orders/RLS reservation-blocker fix, 2026-08-22) — the guard
 * itself now lives inside the reserve_product() RPC (`WHERE id = ? AND
 * status = 'Available'`, see supabase/migrations/2026082206_reserve_
 * product_rpc_authorization.sql), not a direct `.update()` from this
 * layer. This test now pins the RPC call shape (correct product_id) and
 * the P0002 (not found/not Available) -> rejection contract, rather than
 * inspecting a WHERE-clause guard value directly — the underlying
 * guarantee (an Archived/already-Reserved product can never be reserved
 * a second time) is unchanged, only which layer enforces it.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as order.repository.completeOrder.test.ts.
 */
let rpcSucceeds = true;
const rpcCalls: { fnName: string; args: unknown }[] = [];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      rpc(fnName: string, args: unknown) {
        rpcCalls.push({ fnName, args });
        if (rpcSucceeds) {
          return Promise.resolve({ data: { id: "product-1" }, error: null });
        }
        return Promise.resolve({ data: null, error: { code: "P0002", message: "Product is not Available" } });
      },
    },
  },
});

test.beforeEach(() => {
  rpcCalls.length = 0;
  rpcSucceeds = true;
});

test("Case 4: an Available product can be reserved (guard matches, BR-003)", async () => {
  rpcSucceeds = true;

  const { reserveProduct } = await import("./order.repository");
  await assert.doesNotReject(() => reserveProduct("product-1"));

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fnName, "reserve_product", "must go through the reserve_product() RPC, not a direct .update()");
  assert.deepEqual(rpcCalls[0].args, { p_product_id: "product-1" });
});

test("Case 4: an Archived (formerly Returned) product cannot be reserved (RPC returns P0002 -> rejected, never reaches Sold)", async () => {
  rpcSucceeds = false; // status='Archived' never satisfies the RPC's own WHERE status='Available' guard

  const { reserveProduct } = await import("./order.repository");
  await assert.rejects(() => reserveProduct("product-1"));
});
