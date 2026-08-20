import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { Order, OrderItem } from "@/types/order";
import type { OrderRepository } from "./order.repository";

/**
 * D12 Order Cancellation — service-layer tests via createOrderService(repository)
 * DI, same pattern/reasoning as order.service.test.ts (mock.module() once at
 * file scope for @/lib/supabase and @/lib/auditLog.service, business logic
 * exercised entirely through the injected fake repository).
 *
 * Covers Test 1, Test 2, Test 4 (multi-product mixed), Test 6, Test 7,
 * Test 10 (audit), Test 12/13 (disposition -> correct after-value passed
 * through). Test 3/5/8/9/11 are covered elsewhere (order.rules.cancelOrder.test.ts,
 * _authorization.cancellation.test.ts) or require real Dev DB (see the
 * separate manual verification run).
 */
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

const loggedCalls: { input: unknown; client: unknown }[] = [];
mock.module("@/lib/auditLog.service", {
  namedExports: {
    logStatusChange: async (input: unknown, client: unknown) => {
      loggedCalls.push({ input, client });
    },
  },
});

const loggedActivity: { staff_id: string | null; action: string; entity: string; entity_id: string | null }[] = [];
mock.module("@/lib/activityLog.service", {
  namedExports: {
    logActivity: async (entry: { staff_id: string | null; action: string; entity: string; entity_id: string | null }) => {
      loggedActivity.push(entry);
    },
  },
});

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: "OD-20260819-000001",
    customer_id: "customer-1",
    sales_owner: "Nguyen Van A",
    created_by: "Nguyen Van A",
    order_date: "2026-08-19",
    subtotal: 0,
    discount_total: 0,
    total_amount: 0,
    order_status: "Completed",
    payment_status: "Paid",
    ...overrides,
  };
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "item-1",
    order_id: "order-1",
    product_id: "product-1",
    snapshot_sale_price: 1000000,
    discount: 0,
    quantity: 1,
    line_total: 1000000,
    is_gift: false,
    ...overrides,
  };
}

const notImplemented = async () => {
  throw new Error("not implemented in this fake");
};

function makeRepository(overrides: Partial<OrderRepository> = {}): OrderRepository {
  return {
    findAllOrders: notImplemented as unknown as OrderRepository["findAllOrders"],
    findOrderById: async () => makeOrder(),
    findOrderItemsByOrderId: async () => [makeItem()],
    findPaymentsByOrderId: async () => [],
    findOrderEventsByOrderId: async () => [],
    findRevenueRecognizedOrders: async () => [],
    createOrder: notImplemented as unknown as OrderRepository["createOrder"],
    updateOrder: notImplemented as unknown as OrderRepository["updateOrder"],
    deleteOrder: notImplemented as unknown as OrderRepository["deleteOrder"],
    findCompensationStatusesForOrder: notImplemented as unknown as OrderRepository["findCompensationStatusesForOrder"],
    hasFinancialHistoryForOrder: async () => ({ hasCompensation: false, hasCommission: false }),
    findVoidableFinancialRecordsForOrder: async () => ({ compensations: [], commissions: [] }),
    deleteOrderWithReconciliation: notImplemented as unknown as OrderRepository["deleteOrderWithReconciliation"],
    reserveOrder: notImplemented as unknown as OrderRepository["reserveOrder"],
    cancelReservation: notImplemented as unknown as OrderRepository["cancelReservation"],
    addOrderItem: notImplemented as unknown as OrderRepository["addOrderItem"],
    updateOrderItem: notImplemented as unknown as OrderRepository["updateOrderItem"],
    removeOrderItem: notImplemented as unknown as OrderRepository["removeOrderItem"],
    reserveProduct: async () => {},
    releaseProduct: async () => {},
    markProductSold: async () => {},
    addPayment: notImplemented as unknown as OrderRepository["addPayment"],
    markOrderLost: notImplemented as unknown as OrderRepository["markOrderLost"],
    completeOrder: notImplemented as unknown as OrderRepository["completeOrder"],
    cancelOrder: async (orderId: string) => makeOrder({ id: orderId, order_status: "Cancelled" }),
    reassignSalesOwner: notImplemented as unknown as OrderRepository["reassignSalesOwner"],
    appendOrderEvent: async () =>
      ({ id: "event-1", order_id: "order-1", event_type: "Status Changed", event_detail: "", actor: "", event_timestamp: "2026-08-19" }),
    updateOrderRollups: notImplemented as unknown as OrderRepository["updateOrderRollups"],
    ...overrides,
  };
}

test.beforeEach(() => {
  loggedCalls.length = 0;
  loggedActivity.length = 0;
});

test("Test 1: Completed order, one Product -> Remaining", async () => {
  const { createOrderService } = await import("./order.service");
  let captured: { orderId: string; dispositions: unknown } | undefined;
  const repository = makeRepository({
    cancelOrder: async (orderId, dispositions) => {
      captured = { orderId, dispositions };
      return makeOrder({ id: orderId, order_status: "Cancelled" });
    },
  });

  const result = await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Remaining" }] },
    "actor",
    {} as never
  );

  assert.equal(result.order_status, "Cancelled");
  assert.deepEqual(captured?.dispositions, [{ order_item_id: "item-1", disposition: "Remaining" }]);
});

test("Test 2 + Test 12: Completed order, one Product -> Returned (audit 'after' = Returned)", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository();

  await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Returned" }] },
    "actor",
    {} as never
  );

  const productLog = loggedCalls.find((c) => (c.input as { tableName: string }).tableName === "products");
  assert.ok(productLog);
  assert.deepEqual(productLog!.input, {
    tableName: "products",
    recordId: "product-1",
    before: "Sold",
    after: "Returned",
    actor: "actor",
  });
});

test("Test 13: Remaining disposition logs after = Active (never Returned) - returned_at is the RPC's job, not this layer's", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository();

  await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Remaining" }] },
    "actor",
    {} as never
  );

  const productLog = loggedCalls.find((c) => (c.input as { tableName: string }).tableName === "products");
  assert.equal((productLog!.input as { after: string }).after, "Active");
});

test("Test 4: multi-product Order, mixed disposition - each Product logged with its own choice", async () => {
  const { createOrderService } = await import("./order.service");
  const items = [
    makeItem({ id: "item-A", product_id: "product-A" }),
    makeItem({ id: "item-B", product_id: "product-B" }),
    makeItem({ id: "item-C", product_id: "product-C" }),
  ];
  const repository = makeRepository({ findOrderItemsByOrderId: async () => items });

  await createOrderService(repository).cancelOrder(
    {
      order_id: "order-1",
      dispositions: [
        { order_item_id: "item-A", disposition: "Remaining" },
        { order_item_id: "item-B", disposition: "Returned" },
        { order_item_id: "item-C", disposition: "Remaining" },
      ],
    },
    "actor",
    {} as never
  );

  const productLogs = loggedCalls.filter((c) => (c.input as { tableName: string }).tableName === "products");
  assert.equal(productLogs.length, 3);
  const byProduct = Object.fromEntries(productLogs.map((c) => [(c.input as { recordId: string }).recordId, (c.input as { after: string }).after]));
  assert.deepEqual(byProduct, { "product-A": "Active", "product-B": "Returned", "product-C": "Active" });
});

test("Test 4: multi-product Order missing a disposition for one item is rejected before any write", async () => {
  const { createOrderService, OrderValidationError } = await import("./order.service");
  const items = [makeItem({ id: "item-A" }), makeItem({ id: "item-B" })];
  let cancelOrderCalled = false;
  const repository = makeRepository({
    findOrderItemsByOrderId: async () => items,
    cancelOrder: async (orderId) => {
      cancelOrderCalled = true;
      return makeOrder({ id: orderId, order_status: "Cancelled" });
    },
  });

  await assert.rejects(
    () =>
      createOrderService(repository).cancelOrder(
        { order_id: "order-1", dispositions: [{ order_item_id: "item-A", disposition: "Remaining" }] },
        "actor",
        {} as never
      ),
    OrderValidationError
  );
  assert.equal(cancelOrderCalled, false, "must never reach the RPC with incomplete dispositions");
});

test("Test 6: a Draft order cannot be cancelled - rejected before any write", async () => {
  const { createOrderService, OrderRuleViolationError } = await import("./order.service");
  let cancelOrderCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft" }),
    cancelOrder: async (orderId) => {
      cancelOrderCalled = true;
      return makeOrder({ id: orderId, order_status: "Cancelled" });
    },
  });

  await assert.rejects(
    () =>
      createOrderService(repository).cancelOrder(
        { order_id: "order-1", dispositions: [] },
        "actor",
        {} as never
      ),
    OrderRuleViolationError
  );
  assert.equal(cancelOrderCalled, false);
});

test("Test 7: an already-Cancelled order cannot be cancelled again", async () => {
  const { createOrderService, OrderRuleViolationError } = await import("./order.service");
  let cancelOrderCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Cancelled" }),
    cancelOrder: async (orderId) => {
      cancelOrderCalled = true;
      return makeOrder({ id: orderId, order_status: "Cancelled" });
    },
  });

  await assert.rejects(
    () =>
      createOrderService(repository).cancelOrder(
        { order_id: "order-1", dispositions: [] },
        "actor",
        {} as never
      ),
    OrderRuleViolationError
  );
  assert.equal(cancelOrderCalled, false);
});

// Test 10's Order-level half (Completed -> Cancelled logged) is covered by
// lib/orders/order.repository.cancelOrder.test.ts instead - that write
// happens inside order.repository.ts's real cancelOrder(), not this
// service-layer DI fake, so it can't be observed through makeRepository().

test("no auditClient -> no logStatusChange calls (matches D5's fail-clearly-not-silently posture, no actor=null insert)", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository();

  await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Remaining" }] },
    "actor"
    // no auditClient
  );

  assert.equal(loggedCalls.length, 0);
});

test("getCancellationInfo: delegates to repository.hasFinancialHistoryForOrder after confirming the order exists", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository({
    hasFinancialHistoryForOrder: async () => ({ hasCompensation: true, hasCommission: false }),
  });

  const info = await createOrderService(repository).getCancellationInfo("order-1");
  assert.deepEqual(info, { hasCompensation: true, hasCommission: false });
});

// Compensation/Commission Void (Product Owner Authorization, 2026-08-20) —
// Case 1, 2, 10 (audit): the actual Void UPDATE happens inside the RPC
// (repository.cancelOrder, covered by order.repository.cancelOrder.test.ts);
// this service layer only needs to log the correct before/after for each
// row the pre-cancel snapshot (findVoidableFinancialRecordsForOrder)
// found - that's what's under test here.

test("Case 1: Compensation Draft/Pending/Confirmed rows are logged Cancelled, via both audit_log and activity_log", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository({
    findVoidableFinancialRecordsForOrder: async () => ({
      compensations: [
        { id: "comp-1", status: "Draft" },
        { id: "comp-2", status: "Pending" },
        { id: "comp-3", status: "Confirmed" },
      ],
      commissions: [],
    }),
  });

  await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Remaining" }] },
    "actor",
    {} as never
  );

  const compensationLogs = loggedCalls.filter((c) => (c.input as { tableName: string }).tableName === "compensations");
  assert.equal(compensationLogs.length, 3);
  assert.deepEqual(
    compensationLogs.map((c) => (c.input as { recordId: string; before: string; after: string }).before).sort(),
    ["Confirmed", "Draft", "Pending"]
  );
  assert.ok(compensationLogs.every((c) => (c.input as { after: string }).after === "Cancelled"));

  assert.equal(loggedActivity.length, 3);
  assert.ok(loggedActivity.every((a) => a.action === "compensation_voided" && a.entity === "compensation"));
});

test("Case 2: Commission Pending/Approved rows are logged Void", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository({
    findVoidableFinancialRecordsForOrder: async () => ({
      compensations: [],
      commissions: [
        { id: "comm-1", status: "Pending" },
        { id: "comm-2", status: "Approved" },
      ],
    }),
  });

  await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Remaining" }] },
    "actor",
    {} as never
  );

  const commissionLogs = loggedCalls.filter((c) => (c.input as { tableName: string }).tableName === "sales_commissions");
  assert.equal(commissionLogs.length, 2);
  assert.ok(commissionLogs.every((c) => (c.input as { after: string }).after === "Void"));
});

test("Case 7/8: an Order with no voidable Compensation/Commission (e.g. everything already Paid/Handed Off) logs nothing extra", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository({
    findVoidableFinancialRecordsForOrder: async () => ({ compensations: [], commissions: [] }),
  });

  await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Remaining" }] },
    "actor",
    {} as never
  );

  assert.equal(loggedCalls.filter((c) => (c.input as { tableName: string }).tableName === "compensations").length, 0);
  assert.equal(loggedCalls.filter((c) => (c.input as { tableName: string }).tableName === "sales_commissions").length, 0);
  assert.equal(loggedActivity.length, 0);
});

test("without an auditClient, no Compensation/Commission Void logging is attempted (same fail-clearly posture)", async () => {
  const { createOrderService } = await import("./order.service");
  const repository = makeRepository({
    findVoidableFinancialRecordsForOrder: async () => ({
      compensations: [{ id: "comp-1", status: "Pending" }],
      commissions: [{ id: "comm-1", status: "Pending" }],
    }),
  });

  await createOrderService(repository).cancelOrder(
    { order_id: "order-1", dispositions: [{ order_item_id: "item-1", disposition: "Remaining" }] },
    "actor"
    // no auditClient
  );

  assert.equal(loggedCalls.length, 0);
  assert.equal(loggedActivity.length, 0);
});
