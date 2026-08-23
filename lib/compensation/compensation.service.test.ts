import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { Order, OrderItem } from "@/types/order";

/**
 * Partner Compensation Pipeline verification (docs/13_COMPENSATION_SPEC.md,
 * LOCKED Rev 4) — Product Owner directive, 2026-08-15: "VERIFY FIRST, FIX
 * ONLY REAL DEFECTS FOUND." Covers every business transition the directive
 * names for Compensation: Percentage/Fixed Amount calculation, Order-level
 * Method/Value precedence over any Compensation Policy (Decision 12 — the
 * fix for Order OD-20260812-000001's silent 5%-Policy regression), missing/
 * invalid Partner handling, the Eligibility transition, state transitions,
 * and already-processed protection.
 *
 * logActivity (@/lib/activityLog.service) now accepts and receives the same
 * injectable client these functions use (BUG-002 Phase 2B-1 fix) — mocked
 * here as a spy so this file can assert that propagation, same convention
 * order.service.test.ts already uses for its own dependencies.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let logActivityCalls: any[][] = [];
mock.module("@/lib/activityLog.service", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  namedExports: { logActivity: async (...args: any[]) => { logActivityCalls.push(args); } },
});

interface FakeResult {
  data: unknown;
  error?: unknown;
}

interface RecordedCall {
  table: string;
  callIndex: number;
  method: string;
  args: unknown[];
}

/** Records every `.from(table)...` chain call while returning the
 * `perTableSequence[table]`'th queued result for each successive call to
 * that same table (one queue entry consumed per call, last entry repeats
 * once exhausted) — lets a single test drive a function that hits the same
 * table more than once (e.g. confirmCompensation's own select-then-update)
 * with different results at each step. */
function makeClient(perTableSequence: Record<string, FakeResult[]>) {
  const counters: Record<string, number> = {};
  const calls: RecordedCall[] = [];

  return {
    calls,
    client: {
      from(table: string) {
        const seq = perTableSequence[table];
        if (!seq) throw new Error(`Unexpected table in test fake: ${table}`);
        const idx = counters[table] ?? 0;
        counters[table] = idx + 1;
        const result = seq[idx] ?? seq[seq.length - 1];

        const handler: ProxyHandler<object> = {
          get(_target, prop) {
            const resolved = Promise.resolve({ error: null, ...result });
            if (prop === "then") return resolved.then.bind(resolved);
            if (prop === "catch") return resolved.catch.bind(resolved);
            return (...args: unknown[]) => {
              calls.push({ table, callIndex: idx, method: String(prop), args });
              return proxy;
            };
          },
        };
        const proxy: unknown = new Proxy({}, handler);
        return proxy;
      },
    } as never,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: "OD-20260815-000001",
    customer_id: "customer-1",
    partner_id: "partner-1",
    sales_owner: "Nguyen Van A",
    created_by: "Nguyen Van A",
    order_date: "2026-08-15",
    subtotal: 0,
    discount_total: 0,
    total_amount: 0,
    order_status: "Reserved",
    payment_status: "Unpaid",
    ...overrides,
  } as Order;
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

test("createCompensationsForOrder: Percentage method computes calculated_amount = round(line_total * value / 100)", async () => {
  const { createCompensationsForOrder } = await import("./compensation.service");
  const order = makeOrder({ compensation_method: "Percentage" as never, compensation_value: 10 as never });
  const { client, calls } = makeClient({
    compensations: [{ data: [] }, { data: { id: "comp-1" } }],
  });

  await createCompensationsForOrder(order, [makeItem({ line_total: 1234567 })], client);

  const insertCall = calls.find((c) => c.method === "insert");
  assert.ok(insertCall, "expected an insert() call against compensations");
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.calculated_amount, Math.round(1234567 * 0.1));
  assert.equal(payload.method, "Percentage");
  assert.equal(payload.value, 10);
});

test("createCompensationsForOrder: Fixed Amount method sets calculated_amount = value, independent of line_total", async () => {
  const { createCompensationsForOrder } = await import("./compensation.service");
  const order = makeOrder({ compensation_method: "Fixed Amount" as never, compensation_value: 50000 as never });
  const { client, calls } = makeClient({
    compensations: [{ data: [] }, { data: { id: "comp-1" } }],
  });

  await createCompensationsForOrder(order, [makeItem({ line_total: 9999999 })], client);

  const insertCall = calls.find((c) => c.method === "insert");
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.calculated_amount, 50000);
});

test("createCompensationsForOrder: Order-level Method/Value is authoritative — never queries compensation_policies (Decision 12, no silent Policy fallback)", async () => {
  const { createCompensationsForOrder } = await import("./compensation.service");
  const order = makeOrder({ compensation_method: "Percentage" as never, compensation_value: 5 as never });
  const { client, calls } = makeClient({
    compensations: [{ data: [] }, { data: { id: "comp-1" } }],
  });

  await createCompensationsForOrder(order, [makeItem()], client);

  assert.ok(!calls.some((c) => c.table === "compensation_policies"), "must never read compensation_policies");
  const insertCall = calls.find((c) => c.method === "insert");
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.policy_id, null);
  assert.equal(payload.compensation_type, "Commission");
  assert.equal(payload.basis, "Sale Price");
  assert.equal(payload.status, "Draft");
});

test("createCompensationsForOrder: no Partner on Order — creates nothing, never touches compensations table", async () => {
  const { createCompensationsForOrder } = await import("./compensation.service");
  const order = makeOrder({ partner_id: null, compensation_method: "Percentage" as never, compensation_value: 10 as never });
  const { client, calls } = makeClient({ compensations: [] });

  await createCompensationsForOrder(order, [makeItem()], client);

  assert.equal(calls.length, 0, "no compensations table call should happen without a Partner");
});

test("createCompensationsForOrder: Partner set but Method/Value missing — skips creation (defensive; reserveOrder's own gate is the real enforcement point)", async () => {
  const { createCompensationsForOrder } = await import("./compensation.service");
  const order = makeOrder({ compensation_method: null as never, compensation_value: null as never });
  const { client, calls } = makeClient({ compensations: [] });

  await createCompensationsForOrder(order, [makeItem()], client);

  assert.equal(calls.length, 0, "no insert should happen without a valid Method/Value");
});

test("markCompensationsEligible: only advances Draft -> Pending (Eligibility step, OrderCompleted)", async () => {
  const { markCompensationsEligible } = await import("./compensation.service");
  const { client, calls } = makeClient({ compensations: [{ data: [{ id: "comp-1" }] }] });

  await markCompensationsEligible("order-1", client);

  const updateCall = calls.find((c) => c.method === "update");
  assert.deepEqual(updateCall!.args[0], { status: "Pending" });
  const statusFilter = calls.find((c) => c.method === "eq" && c.args[0] === "status");
  assert.deepEqual(statusFilter!.args, ["status", "Draft"]);
});

test("cancelCompensationsForOrder: Phase B (Option B, Product Owner Approval 2026-08-21) — Draft/Pending/Confirmed are voided; Handed Off/Paid are never touched by this path", async () => {
  const { cancelCompensationsForOrder } = await import("./compensation.service");
  const { client, calls } = makeClient({ compensations: [{ data: [{ id: "comp-1" }] }] });

  await cancelCompensationsForOrder("order-1", client);

  const inFilter = calls.find((c) => c.method === "in");
  assert.deepEqual(inFilter!.args, ["status", ["Draft", "Pending", "Confirmed"]]);
  assert.ok(
    !(inFilter!.args[1] as string[]).includes("Handed Off") && !(inFilter!.args[1] as string[]).includes("Paid"),
    "Handed Off/Paid compensations must never be reachable by Order-cancel voiding — reversal for those is Settlement's own separate cancel_settlement_with_reversal() path"
  );
});

test("confirmCompensation: Pending + Payment Status Paid -> Confirmed", async () => {
  const { confirmCompensation } = await import("./compensation.service");
  const { client } = makeClient({
    compensations: [{ data: { id: "comp-1", status: "Pending", order_id: "order-1" } }, { data: { id: "comp-1", status: "Confirmed" } }],
    orders: [{ data: { payment_status: "Paid" } }],
  });

  const result = await confirmCompensation("comp-1", "staff-1", client);
  assert.equal(result.status, "Confirmed");
});

test("confirmCompensation: passes its own client through to logActivity (BUG-002 Phase 2B-1 fix)", async () => {
  const { confirmCompensation } = await import("./compensation.service");
  logActivityCalls = [];
  const { client } = makeClient({
    compensations: [{ data: { id: "comp-1", status: "Pending", order_id: "order-1" } }, { data: { id: "comp-1", status: "Confirmed" } }],
    orders: [{ data: { payment_status: "Paid" } }],
  });

  await confirmCompensation("comp-1", "staff-1", client);

  assert.equal(logActivityCalls.length, 1);
  const [, loggedClient] = logActivityCalls[0];
  assert.equal(loggedClient, client);
});

test("confirmCompensation: already-processed protection — rejects when not Pending (e.g. already Confirmed)", async () => {
  const { confirmCompensation, CompensationRuleViolationError } = await import("./compensation.service");
  const { client } = makeClient({
    compensations: [{ data: { id: "comp-1", status: "Confirmed", order_id: "order-1" } }],
  });

  await assert.rejects(() => confirmCompensation("comp-1", "staff-1", client), CompensationRuleViolationError);
});

test("confirmCompensation: BR-001-style gate — rejects when Order's Payment Status is not Paid", async () => {
  const { confirmCompensation, CompensationRuleViolationError } = await import("./compensation.service");
  const { client } = makeClient({
    compensations: [{ data: { id: "comp-1", status: "Pending", order_id: "order-1" } }],
    orders: [{ data: { payment_status: "Unpaid" } }],
  });

  await assert.rejects(() => confirmCompensation("comp-1", "staff-1", client), CompensationRuleViolationError);
});

test("handOffCompensation: Confirmed -> Handed Off", async () => {
  const { handOffCompensation } = await import("./compensation.service");
  const { client } = makeClient({
    compensations: [{ data: { id: "comp-1", status: "Confirmed" } }, { data: { id: "comp-1", status: "Handed Off" } }],
    orders: [{ data: { order_status: "Completed" } }],
  });

  const result = await handOffCompensation("comp-1", client);
  assert.equal(result.status, "Handed Off");
});

test("handOffCompensation: rejects when not Confirmed (e.g. still Pending, or already Handed Off)", async () => {
  const { handOffCompensation, CompensationRuleViolationError } = await import("./compensation.service");
  const { client } = makeClient({ compensations: [{ data: { id: "comp-1", status: "Pending" } }] });

  await assert.rejects(() => handOffCompensation("comp-1", client), CompensationRuleViolationError);
});

// Compensation/Commission Void (Product Owner Authorization, 2026-08-20) —
// Case 3 & Case 4: financial actions must reject on a Cancelled Order,
// enforced at the service-layer boundary (defense-in-depth — in the normal
// flow, cancel_order_with_disposition's own RPC has already Voided any
// Draft/Pending/Confirmed Compensation atomically, so these two paths
// exist for the case where that RPC hasn't run yet against this exact row
// for any reason, never as the primary mechanism).

test("Case 3: confirmCompensation rejects when the Order is Cancelled", async () => {
  const { confirmCompensation, CompensationRuleViolationError } = await import("./compensation.service");
  const { client } = makeClient({
    compensations: [{ data: { id: "comp-1", status: "Pending", order_id: "order-1" } }],
    orders: [{ data: { payment_status: "Paid", order_status: "Cancelled" } }],
  });

  await assert.rejects(() => confirmCompensation("comp-1", "staff-1", client), CompensationRuleViolationError);
});

test("Case 4: handOffCompensation rejects when the Order is Cancelled", async () => {
  const { handOffCompensation, CompensationRuleViolationError } = await import("./compensation.service");
  const { client } = makeClient({
    compensations: [{ data: { id: "comp-1", status: "Confirmed", order_id: "order-1" } }],
    orders: [{ data: { order_status: "Cancelled" } }],
  });

  await assert.rejects(() => handOffCompensation("comp-1", client), CompensationRuleViolationError);
});
