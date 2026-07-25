import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Orders -> Sales Snapshot Integration: pins the shape of the new
 * completeOrder() repository call — it must go through a single
 * `supabase.rpc("complete_order_with_snapshots", ...)` call (the atomic
 * write, Revision 3/4) rather than the old plain
 * `.from("orders").update(...)`.
 *
 * mock.module() is called exactly once, at file scope (matching
 * order.service.test.ts's convention) — a module already imported earlier
 * in this same process has its `import { supabase } from "@/lib/supabase"`
 * binding resolved once, at first evaluation, so a *second* mock.module()
 * call later in the same file cannot be relied on to change what an
 * already-cached importer sees. `nextRpcResult`/`rpcCalls` are mutated
 * per-test instead.
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

test.beforeEach(() => {
  rpcCalls.length = 0;
  nextRpcResult = { data: null, error: null };
});

test("completeOrder: calls the complete_order_with_snapshots RPC with order id + both row arrays", async () => {
  const fakeOrder = { id: "order-1", order_status: "Completed" };
  nextRpcResult = { data: fakeOrder, error: null };

  const { completeOrder } = await import("./order.repository");

  const purchaseRows = [
    {
      id: "purchase-1",
      customer_id: "customer-1",
      product_id: "product-1",
      sale_price: 14000000,
      sale_date: "2026-07-23",
      source: null,
      salesperson: "Nguyen Van A",
      salesperson_id: "staff-1",
      order_item_id: "item-1",
    },
  ];
  const commissionRows = [
    {
      id: "commission-1",
      purchase_id: "purchase-1",
      customer_id: "customer-1",
      salesperson: "Nguyen Van A",
      salesperson_id: "staff-1",
      sale_amount: 14000000,
      commission_percent: 3,
      commission_amount: 420000,
      status: "Pending" as const,
    },
  ];

  const result = await completeOrder("order-1", purchaseRows, commissionRows);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "complete_order_with_snapshots");
  assert.equal(rpcCalls[0].params.p_order_id, "order-1");
  assert.deepEqual(rpcCalls[0].params.p_purchase_rows, purchaseRows);
  assert.deepEqual(rpcCalls[0].params.p_commission_rows, commissionRows);
  assert.deepEqual(result, fakeOrder);
});

test("completeOrder: RPC error (e.g. order already Completed) throws OrderRepositoryError, never swallowed", async () => {
  nextRpcResult = { data: null, error: { message: "Order is not in a completable state" } };

  const { completeOrder, OrderRepositoryError } = await import("./order.repository");

  await assert.rejects(() => completeOrder("order-1", [], []), OrderRepositoryError);
});
