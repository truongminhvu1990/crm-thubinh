import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * D12 Order Cancellation — pins cancel_order_with_disposition's RPC-call
 * shape (mirrors order.repository.completeOrder.test.ts's own reasoning/
 * pattern for why this must be an RPC call, not a plain UPDATE) and covers
 * Test 10's Order-level half: the Completed -> Cancelled audit_log entry.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as order.repository.completeOrder.test.ts.
 */
interface CapturedRpcCall {
  fn: string;
  params: Record<string, unknown>;
}

let nextRpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const rpcCalls: CapturedRpcCall[] = [];

mock.module("@/lib/supabase", {
  namedExports: {
    supabase: {
      rpc(fn: string, params: Record<string, unknown>) {
        rpcCalls.push({ fn, params });
        return Promise.resolve(nextRpcResult);
      },
    },
  },
});

const loggedCalls: { input: unknown; client: unknown }[] = [];
mock.module("@/lib/auditLog.service", {
  namedExports: {
    logStatusChange: async (input: unknown, client: unknown) => {
      loggedCalls.push({ input, client });
    },
  },
});

test.beforeEach(() => {
  rpcCalls.length = 0;
  loggedCalls.length = 0;
  nextRpcResult = { data: null, error: null };
});

test("cancelOrder: calls cancel_order_with_disposition with order id + dispositions verbatim", async () => {
  const fakeOrder = { id: "order-1", order_status: "Cancelled" };
  nextRpcResult = { data: fakeOrder, error: null };

  const { cancelOrder } = await import("./order.repository");
  const dispositions = [
    { order_item_id: "item-1", disposition: "Remaining" },
    { order_item_id: "item-2", disposition: "Returned" },
  ];
  const result = await cancelOrder("order-1", dispositions);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "cancel_order_with_disposition");
  assert.deepEqual(rpcCalls[0].params, { p_order_id: "order-1", p_dispositions: dispositions });
  assert.deepEqual(result, fakeOrder);
});

test("Test 10: with an audit context, the Order's own Completed -> Cancelled transition is logged", async () => {
  nextRpcResult = { data: { id: "order-1", order_status: "Cancelled" }, error: null };
  const fakeClient = { marker: "fake-authenticated-client" };

  const { cancelOrder } = await import("./order.repository");
  await cancelOrder("order-1", [{ order_item_id: "item-1", disposition: "Remaining" }], {
    actor: "owner@test.local",
    client: fakeClient as never,
  });

  assert.equal(loggedCalls.length, 1);
  assert.deepEqual(loggedCalls[0].input, {
    tableName: "orders",
    recordId: "order-1",
    before: "Completed",
    after: "Cancelled",
    actor: "owner@test.local",
  });
  assert.equal(loggedCalls[0].client, fakeClient);
});

test("cancelOrder: without an audit context, no insert is attempted (never actor=null)", async () => {
  nextRpcResult = { data: { id: "order-1", order_status: "Cancelled" }, error: null };

  const { cancelOrder } = await import("./order.repository");
  await cancelOrder("order-1", [{ order_item_id: "item-1", disposition: "Remaining" }]);

  assert.equal(loggedCalls.length, 0);
});

test("Test 9/11: RPC error (e.g. a rolled-back transaction) throws, never returns a partial result", async () => {
  nextRpcResult = { data: null, error: { message: "Product product-1 is not Sold", code: "P0001" } };

  const { cancelOrder, OrderRepositoryError } = await import("./order.repository");
  await assert.rejects(
    () => cancelOrder("order-1", [{ order_item_id: "item-1", disposition: "Returned" }]),
    OrderRepositoryError
  );
  assert.equal(loggedCalls.length, 0, "no audit entry for a cancellation that never actually happened");
});
