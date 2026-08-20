import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { Order, OrderItem, OrderPayment, OrderEvent } from "@/types/order";
import type { CommissionRule } from "@/types/commission";
import type { OrderRepository, PurchaseSnapshotInput, CommissionSnapshotInput } from "./order.repository";

/**
 * Orders -> Sales Snapshot Integration: coverage for completeOrder()'s new
 * orchestration (Rules 1-9). Uses the OrderRepository interface's own
 * dependency-injection seam (createOrderService(repository)) instead of
 * mocking Supabase directly, since business logic here never touches
 * `supabase` itself — only getStaffByName/getActiveCommissionRules do.
 *
 * mock.module() is set up exactly once, at file scope, matching
 * order.repository.test.ts's convention — its two fakes read from mutable
 * `staffLookupResult`/`activeCommissionRules` set per-test, rather than
 * calling mock.module() again per test, since a module already imported
 * (and its live bindings resolved) earlier in this file shouldn't be
 * assumed to pick up a *second* mock.module() call for the same specifier.
 */

let staffLookupResult: { id: string; full_name: string } | null = { id: "staff-1", full_name: "Nguyen Van A" };
let activeCommissionRules: CommissionRule[] = [
  { id: "rule-1", minimum_amount: 0, maximum_amount: 9999999, commission_percent: 5, is_active: true, created_at: "", updated_at: "" },
  { id: "rule-2", minimum_amount: 10000000, maximum_amount: null, commission_percent: 3, is_active: true, created_at: "", updated_at: "" },
];

// order.service.ts's own module-level `import * as orderRepository from
// "./order.repository"` transitively pulls in "@/lib/supabase", which
// creates a real Supabase client at module-eval time and throws without
// project env vars configured. Every test here drives completeOrder()
// entirely through the injected fake OrderRepository (DI), so this only
// needs to exist, never be called.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/staff.service", {
  namedExports: {
    getStaffByName: async () => staffLookupResult,
  },
});
mock.module("@/lib/commission/commission.repository", {
  namedExports: {
    getActiveCommissionRules: async () => activeCommissionRules,
  },
});

/** Payment / Bank Account / Money-Debt domain redesign, Stage 3 —
 * addPayment's own active-receiving-account existence check
 * (order.service.ts) reads this via getReceivingAccountById; mocked
 * wholesale for the same reason as compensation/notification above. Tests
 * set `receivingAccountLookupResult` per-case. Deliberately does NOT
 * mock lib/moneyDebtLedger/* at all — addPayment must never import it. */
let receivingAccountLookupResult: { id: string; is_active: boolean } | null = { id: "account-1", is_active: true };
mock.module("@/lib/receivingAccount.service", {
  namedExports: {
    getReceivingAccountById: async () => receivingAccountLookupResult,
  },
});

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: "OD-20260723-000001",
    customer_id: "customer-1",
    sales_owner: "Nguyen Van A",
    created_by: "Nguyen Van A",
    order_date: "2026-07-23",
    subtotal: 0,
    discount_total: 0,
    total_amount: 0,
    order_status: "Reserved",
    payment_status: "Unpaid",
    ...overrides,
  };
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "item-1",
    order_id: "order-1",
    product_id: "product-1",
    snapshot_sale_price: 20000000,
    discount: 0,
    quantity: 1,
    line_total: 20000000,
    is_gift: false,
    ...overrides,
  };
}

function makeRepository(overrides: Partial<OrderRepository> = {}): OrderRepository {
  const notImplemented = async () => {
    throw new Error("not implemented in this fake");
  };
  return {
    findAllOrders: notImplemented as unknown as OrderRepository["findAllOrders"],
    findOrderById: async () => makeOrder(),
    findOrderItemsByOrderId: async () => [makeItem()],
    findPaymentsByOrderId: async (): Promise<OrderPayment[]> => [],
    findOrderEventsByOrderId: async (): Promise<OrderEvent[]> => [],
    findRevenueRecognizedOrders: async (): Promise<Order[]> => [],
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
    completeOrder: async (orderId: string) => makeOrder({ id: orderId, order_status: "Completed" }),
    cancelOrder: notImplemented as unknown as OrderRepository["cancelOrder"],
    reassignSalesOwner: notImplemented as unknown as OrderRepository["reassignSalesOwner"],
    appendOrderEvent: async () =>
      ({ id: "event-1", order_id: "order-1", event_type: "Status Changed", event_detail: "", actor: "", event_timestamp: "2026-07-23" }) as OrderEvent,
    updateOrderRollups: notImplemented as unknown as OrderRepository["updateOrderRollups"],
    ...overrides,
  };
}

test.beforeEach(() => {
  staffLookupResult = { id: "staff-1", full_name: "Nguyen Van A" };
  activeCommissionRules = [
    { id: "rule-1", minimum_amount: 0, maximum_amount: 9999999, commission_percent: 5, is_active: true, created_at: "", updated_at: "" },
    { id: "rule-2", minimum_amount: 10000000, maximum_amount: null, commission_percent: 3, is_active: true, created_at: "", updated_at: "" },
  ];
});

test("completeOrder: sale_price = order_item.line_total, never order.total_amount", async () => {
  const { createOrderService } = await import("./order.service");

  const items = [
    makeItem({ id: "item-1", line_total: 14000000, snapshot_sale_price: 15000000, discount: 1000000 }),
    makeItem({ id: "item-2", product_id: "product-2", line_total: 11000000, snapshot_sale_price: 11000000, discount: 0 }),
  ];
  // Order-level total is the SUM (25,000,000) — deliberately different from
  // either item's own line_total, so a bug that reads order.total_amount
  // instead of the per-item field would show up immediately.
  const order = makeOrder({ total_amount: 25000000 });

  let captured!: { purchaseRows: PurchaseSnapshotInput[]; commissionRows: CommissionSnapshotInput[] };
  const repository = makeRepository({
    findOrderById: async () => order,
    findOrderItemsByOrderId: async () => items,
    completeOrder: async (orderId, purchaseRows, commissionRows) => {
      captured = { purchaseRows, commissionRows };
      return makeOrder({ id: orderId, order_status: "Completed" });
    },
  });

  await createOrderService(repository).completeOrder("order-1", "actor");

  assert.equal(captured.purchaseRows.length, 2);
  assert.equal(captured.purchaseRows[0].sale_price, 14000000);
  assert.equal(captured.purchaseRows[1].sale_price, 11000000);
  // Never the order-level rollup.
  assert.ok(captured.purchaseRows.every((r) => r.sale_price !== 25000000));
});

test("completeOrder: one customer_purchases + one sales_commissions row per order_item", async () => {
  const { createOrderService } = await import("./order.service");

  const items = [makeItem({ id: "item-1" }), makeItem({ id: "item-2", product_id: "product-2" }), makeItem({ id: "item-3", product_id: "product-3" })];

  let captured!: { purchaseRows: PurchaseSnapshotInput[]; commissionRows: CommissionSnapshotInput[] };
  const repository = makeRepository({
    findOrderItemsByOrderId: async () => items,
    completeOrder: async (orderId, purchaseRows, commissionRows) => {
      captured = { purchaseRows, commissionRows };
      return makeOrder({ id: orderId, order_status: "Completed" });
    },
  });

  await createOrderService(repository).completeOrder("order-1", "actor");

  assert.equal(captured.purchaseRows.length, 3);
  assert.equal(captured.commissionRows.length, 3);
  assert.deepEqual(
    captured.purchaseRows.map((r) => r.order_item_id),
    ["item-1", "item-2", "item-3"]
  );
  // Every commission row's purchase_id must match its sibling purchase row's id.
  for (let i = 0; i < 3; i++) {
    assert.equal(captured.commissionRows[i].purchase_id, captured.purchaseRows[i].id);
  }
});

test("completeOrder: customer_id/product_id/sale_date come from Order/order_item, source is always null", async () => {
  const { createOrderService } = await import("./order.service");

  const order = makeOrder({ customer_id: "customer-42", order_date: "2026-06-01" });
  const item = makeItem({ product_id: "product-99" });

  let captured: PurchaseSnapshotInput[] = [];
  const repository = makeRepository({
    findOrderById: async () => order,
    findOrderItemsByOrderId: async () => [item],
    completeOrder: async (orderId, purchaseRows) => {
      captured = purchaseRows;
      return makeOrder({ id: orderId, order_status: "Completed" });
    },
  });

  await createOrderService(repository).completeOrder("order-1", "actor");

  assert.equal(captured[0].customer_id, "customer-42");
  assert.equal(captured[0].product_id, "product-99");
  assert.equal(captured[0].sale_date, "2026-06-01");
  assert.equal(captured[0].source, null);
});

test("completeOrder: salesperson/salesperson_id resolved from order.sales_owner, not Product", async () => {
  staffLookupResult = { id: "staff-7", full_name: "Nguyen Van A" };
  const { createOrderService } = await import("./order.service");

  const order = makeOrder({ sales_owner: "Nguyen Van A" });

  let capturedPurchase: PurchaseSnapshotInput[] = [];
  let capturedCommission: CommissionSnapshotInput[] = [];
  const repository = makeRepository({
    findOrderById: async () => order,
    completeOrder: async (orderId, purchaseRows, commissionRows) => {
      capturedPurchase = purchaseRows;
      capturedCommission = commissionRows;
      return makeOrder({ id: orderId, order_status: "Completed" });
    },
  });

  await createOrderService(repository).completeOrder("order-1", "actor");

  assert.equal(capturedPurchase[0].salesperson, "Nguyen Van A");
  assert.equal(capturedPurchase[0].salesperson_id, "staff-7");
  assert.equal(capturedCommission[0].salesperson, "Nguyen Van A");
  assert.equal(capturedCommission[0].salesperson_id, "staff-7");
});

test("completeOrder: no staff match still saves the sales_owner text with a null salesperson_id", async () => {
  staffLookupResult = null;
  const { createOrderService } = await import("./order.service");

  let capturedPurchase: PurchaseSnapshotInput[] = [];
  const repository = makeRepository({
    completeOrder: async (orderId, purchaseRows) => {
      capturedPurchase = purchaseRows;
      return makeOrder({ id: orderId, order_status: "Completed" });
    },
  });

  await createOrderService(repository).completeOrder("order-1", "actor");

  assert.equal(capturedPurchase[0].salesperson, "Nguyen Van A");
  assert.equal(capturedPurchase[0].salesperson_id, null);
});

test("completeOrder: commission_percent/commission_amount reuse the real bracket-matching logic unchanged", async () => {
  const { createOrderService } = await import("./order.service");

  // 14,000,000 > 9,999,999, so it must fall into bracket 2 (10,000,000+,
  // 3%) — pins the exact same range/tie-break logic findMatchingRule
  // already implements, called for real (not re-derived here).
  const item = makeItem({ line_total: 14000000 });

  let capturedCommission: CommissionSnapshotInput[] = [];
  const repository = makeRepository({
    findOrderItemsByOrderId: async () => [item],
    completeOrder: async (orderId, _purchaseRows, commissionRows) => {
      capturedCommission = commissionRows;
      return makeOrder({ id: orderId, order_status: "Completed" });
    },
  });

  await createOrderService(repository).completeOrder("order-1", "actor");

  assert.equal(capturedCommission[0].commission_percent, 3);
  assert.equal(capturedCommission[0].commission_amount, 14000000 * 0.03);
});

test("completeOrder: no matching commission rule blocks completion entirely (order never flips, no partial state)", async () => {
  activeCommissionRules = []; // no active rules -> findMatchingRule can never succeed
  const { createOrderService, OrderRuleViolationError } = await import("./order.service");

  let completeOrderCalled = false;
  const repository = makeRepository({
    completeOrder: async (orderId) => {
      completeOrderCalled = true;
      return makeOrder({ id: orderId, order_status: "Completed" });
    },
  });

  await assert.rejects(() => createOrderService(repository).completeOrder("order-1", "actor"), OrderRuleViolationError);
  // The whole point of Rule 4/Revision 4: if a snapshot can't be built,
  // repository.completeOrder() (the irreversible status flip) must never
  // even be attempted.
  assert.equal(completeOrderCalled, false);
});

/**
 * Admin Order Deletion (Product Owner Full Order Control Decision,
 * 2026-08-14, security-hardened 2026-08-16). Service-layer coverage only —
 * these tests exercise createOrderService(repository)'s business logic via
 * the fake OrderRepository (DI), never the real Supabase-backed
 * lib/orders/order.repository.ts. The database-level authorization
 * (Owner-role check, Confirmed/Handed-Off check re-enforced inside
 * delete_order_with_reconciliation itself, and the anon/authenticated
 * EXECUTE-privilege denial) is verified separately, live, against Dev — see
 * this release's own verification notes; a unit test running without a
 * live Postgres connection cannot exercise real RPC-level GRANT/REVOKE
 * behavior, and this file does not pretend otherwise.
 */

test("deleteOrder (non-admin): unchanged — Draft/Unpaid gate still applies, still releases items' products, no compensation check, no RPC call", async () => {
  const { createOrderService } = await import("./order.service");

  const deleteOrderCalls: { id: string; adminOverride?: boolean }[] = [];
  const releasedProductIds: string[] = [];
  let reconciliationCalled = false;

  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    findOrderItemsByOrderId: async () => [makeItem({ product_id: "product-1" })],
    deleteOrder: async (id, adminOverride) => {
      deleteOrderCalls.push({ id, adminOverride });
    },
    releaseProduct: async (productId) => {
      releasedProductIds.push(productId);
    },
    deleteOrderWithReconciliation: async () => {
      reconciliationCalled = true;
    },
  });

  await createOrderService(repository).deleteOrder("order-1", "actor");

  assert.deepEqual(deleteOrderCalls, [{ id: "order-1", adminOverride: false }]);
  assert.deepEqual(releasedProductIds, ["product-1"]);
  assert.equal(reconciliationCalled, false);
});

test("deleteOrder (non-admin): rejects when order is not Draft/Unpaid — never reaches repository.deleteOrder", async () => {
  const { createOrderService, OrderRuleViolationError } = await import("./order.service");

  let deleteOrderCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Reserved", payment_status: "Unpaid" }),
    deleteOrder: async () => {
      deleteOrderCalled = true;
    },
  });

  await assert.rejects(() => createOrderService(repository).deleteOrder("order-1", "actor"), OrderRuleViolationError);
  assert.equal(deleteOrderCalled, false);
});

test("deleteOrder (admin, Owner): eligible order — checks Compensation status, then calls deleteOrderWithReconciliation with the server-verified staffId, never the simple deleteOrder", async () => {
  const { createOrderService } = await import("./order.service");

  let simpleDeleteCalled = false;
  const reconciliationCalls: { staffId: string; orderId: string }[] = [];

  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Completed", payment_status: "Paid" }),
    findCompensationStatusesForOrder: async () => [],
    deleteOrder: async () => {
      simpleDeleteCalled = true;
    },
    deleteOrderWithReconciliation: async (staffId, orderId) => {
      reconciliationCalls.push({ staffId, orderId });
    },
  });

  await createOrderService(repository).deleteOrder("order-1", "actor", true, "staff-owner-1");

  assert.equal(simpleDeleteCalled, false);
  assert.deepEqual(reconciliationCalls, [{ staffId: "staff-owner-1", orderId: "order-1" }]);
});

test("deleteOrder (admin, Owner): a Confirmed compensation blocks deletion — reconciliation is never called", async () => {
  const { createOrderService, OrderDeleteCompensationConflictError } = await import("./order.service");

  let reconciliationCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Completed", payment_status: "Paid" }),
    findCompensationStatusesForOrder: async () => ["Confirmed"],
    deleteOrderWithReconciliation: async () => {
      reconciliationCalled = true;
    },
  });

  await assert.rejects(
    () => createOrderService(repository).deleteOrder("order-1", "actor", true, "staff-owner-1"),
    OrderDeleteCompensationConflictError
  );
  assert.equal(reconciliationCalled, false);
});

test("deleteOrder (admin, Owner): a Handed Off compensation blocks deletion — reconciliation is never called", async () => {
  const { createOrderService, OrderDeleteCompensationConflictError } = await import("./order.service");

  let reconciliationCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Completed", payment_status: "Paid" }),
    findCompensationStatusesForOrder: async () => ["Handed Off"],
    deleteOrderWithReconciliation: async () => {
      reconciliationCalled = true;
    },
  });

  await assert.rejects(
    () => createOrderService(repository).deleteOrder("order-1", "actor", true, "staff-owner-1"),
    OrderDeleteCompensationConflictError
  );
  assert.equal(reconciliationCalled, false);
});

test("deleteOrder (admin, Owner): a Draft/Pending/Cancelled compensation does NOT block deletion", async () => {
  const { createOrderService } = await import("./order.service");

  let reconciliationCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Completed", payment_status: "Paid" }),
    findCompensationStatusesForOrder: async () => ["Draft", "Pending", "Cancelled"],
    deleteOrderWithReconciliation: async () => {
      reconciliationCalled = true;
    },
  });

  await createOrderService(repository).deleteOrder("order-1", "actor", true, "staff-owner-1");
  assert.equal(reconciliationCalled, true);
});

test("deleteOrder (admin): missing staffId is rejected before reconciliation is ever attempted — the caller (API route) must always supply the server-verified actor", async () => {
  const { createOrderService, OrderRuleViolationError } = await import("./order.service");

  let reconciliationCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Completed", payment_status: "Paid" }),
    findCompensationStatusesForOrder: async () => [],
    deleteOrderWithReconciliation: async () => {
      reconciliationCalled = true;
    },
  });

  await assert.rejects(() => createOrderService(repository).deleteOrder("order-1", "actor", true), OrderRuleViolationError);
  assert.equal(reconciliationCalled, false);
});

test("deleteOrder (admin, Owner): already-deleted/nonexistent order is handled safely — requireOrder's existing 404 path, never reaches the compensation check or reconciliation", async () => {
  const { createOrderService, OrderNotFoundError } = await import("./order.service");

  let compensationCheckCalled = false;
  const repository = makeRepository({
    findOrderById: async () => null,
    findCompensationStatusesForOrder: async () => {
      compensationCheckCalled = true;
      return [];
    },
  });

  await assert.rejects(
    () => createOrderService(repository).deleteOrder("order-does-not-exist", "actor", true, "staff-owner-1"),
    OrderNotFoundError
  );
  assert.equal(compensationCheckCalled, false);
});

// ============================================================
// Payment / Bank Account / Money-Debt domain redesign, Stage 3 (LOCKED)
// ============================================================

test("addPayment: Bank Transfer without receiving_account_id is rejected with OrderValidationError, repository never reached", async () => {
  const { createOrderService, OrderValidationError } = await import("./order.service");
  let repositoryAddPaymentCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    addPayment: async (input) => {
      repositoryAddPaymentCalled = true;
      return { id: "payment-1", ...input } as OrderPayment;
    },
  });

  await assert.rejects(
    () =>
      createOrderService(repository).addPayment(
        { order_id: "order-1", amount: 1000000, payment_method: "Bank Transfer", payment_date: "2026-08-16" } as never,
        "actor"
      ),
    OrderValidationError
  );
  assert.equal(repositoryAddPaymentCalled, false);
});

test("addPayment: Bank Transfer with an active receiving_account_id succeeds and persists it", async () => {
  const { createOrderService } = await import("./order.service");
  receivingAccountLookupResult = { id: "account-1", is_active: true };
  let persistedInput: unknown = null;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    addPayment: async (input) => {
      persistedInput = input;
      return { id: "payment-1", ...input } as OrderPayment;
    },
    findPaymentsByOrderId: async () => [],
    updateOrderRollups: async (orderId, rollups) => makeOrder({ id: orderId, ...rollups }),
  });

  await createOrderService(repository).addPayment(
    { order_id: "order-1", amount: 1000000, payment_method: "Bank Transfer", payment_date: "2026-08-16", receiving_account_id: "account-1" } as never,
    "actor"
  );

  assert.equal((persistedInput as { receiving_account_id: string }).receiving_account_id, "account-1");
});

test("addPayment: Bank Transfer with an INACTIVE receiving_account_id is rejected with OrderRuleViolationError, repository never reached", async () => {
  const { createOrderService, OrderRuleViolationError } = await import("./order.service");
  receivingAccountLookupResult = { id: "account-1", is_active: false };
  let repositoryAddPaymentCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    addPayment: async (input) => {
      repositoryAddPaymentCalled = true;
      return { id: "payment-1", ...input } as OrderPayment;
    },
  });

  await assert.rejects(
    () =>
      createOrderService(repository).addPayment(
        { order_id: "order-1", amount: 1000000, payment_method: "Bank Transfer", payment_date: "2026-08-16", receiving_account_id: "account-1" } as never,
        "actor"
      ),
    OrderRuleViolationError
  );
  assert.equal(repositoryAddPaymentCalled, false);
  receivingAccountLookupResult = { id: "account-1", is_active: true }; // reset for later tests
});

test("addPayment: Bank Transfer with a non-existent receiving_account_id is rejected with OrderRuleViolationError", async () => {
  const { createOrderService, OrderRuleViolationError } = await import("./order.service");
  receivingAccountLookupResult = null;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    addPayment: async () => {
      throw new Error("must not reach the repository");
    },
  });

  await assert.rejects(
    () =>
      createOrderService(repository).addPayment(
        { order_id: "order-1", amount: 1000000, payment_method: "Bank Transfer", payment_date: "2026-08-16", receiving_account_id: "does-not-exist" } as never,
        "actor"
      ),
    OrderRuleViolationError
  );
  receivingAccountLookupResult = { id: "account-1", is_active: true }; // reset for later tests
});

test("addPayment: Cash does not require receiving_account_id and persists it as absent", async () => {
  const { createOrderService } = await import("./order.service");
  let persistedInput: unknown = null;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    addPayment: async (input) => {
      persistedInput = input;
      return { id: "payment-1", ...input } as OrderPayment;
    },
    findPaymentsByOrderId: async () => [],
    updateOrderRollups: async (orderId, rollups) => makeOrder({ id: orderId, ...rollups }),
  });

  await createOrderService(repository).addPayment(
    { order_id: "order-1", amount: 1000000, payment_method: "Cash", payment_date: "2026-08-16" } as never,
    "actor"
  );

  assert.equal((persistedInput as { receiving_account_id?: string }).receiving_account_id, undefined);
});

test("addPayment: PayPal does not require receiving_account_id (same rule as Cash, not the Bank Transfer literal)", async () => {
  const { createOrderService } = await import("./order.service");
  let repositoryAddPaymentCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    addPayment: async (input) => {
      repositoryAddPaymentCalled = true;
      return { id: "payment-1", ...input } as OrderPayment;
    },
    findPaymentsByOrderId: async () => [],
    updateOrderRollups: async (orderId, rollups) => makeOrder({ id: orderId, ...rollups }),
  });

  await createOrderService(repository).addPayment(
    { order_id: "order-1", amount: 1000000, payment_method: "PayPal", payment_date: "2026-08-16" } as never,
    "actor"
  );

  assert.equal(repositoryAddPaymentCalled, true);
});

test("addPayment: a non-Bank-Transfer method with a receiving_account_id supplied anyway is rejected — must stay NULL, never silently accepted", async () => {
  const { createOrderService, OrderValidationError } = await import("./order.service");
  let repositoryAddPaymentCalled = false;
  const repository = makeRepository({
    findOrderById: async () => makeOrder({ order_status: "Draft", payment_status: "Unpaid" }),
    addPayment: async () => {
      repositoryAddPaymentCalled = true;
      throw new Error("must not reach the repository");
    },
  });

  await assert.rejects(
    () =>
      createOrderService(repository).addPayment(
        { order_id: "order-1", amount: 1000000, payment_method: "Cash", payment_date: "2026-08-16", receiving_account_id: "account-1" } as never,
        "actor"
      ),
    OrderValidationError
  );
  assert.equal(repositoryAddPaymentCalled, false);
});
