import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * RLS client propagation regression coverage (2026082312 follow-up) —
 * findPaymentsByOrderId()/findOrderEventsByOrderId() used to accept no
 * client at all and always hit the anon-defaulting module-level `supabase`
 * singleton; payments/order_events both carry authenticated-only RLS
 * policies (2026082214), so an anon-scoped read here silently returns zero
 * rows regardless of real data — this is why orders.payment_status could
 * stay "Unpaid" even after a real payment existed.
 *
 * A separate file (not order.repository.test.ts/order.service.test.ts,
 * both of which already call mock.module("@/lib/supabase") once for their
 * own purposes) since node:test's mock.module() rejects mocking the same
 * specifier twice within one process — matches the existing
 * *.clientPropagation.test.ts naming convention already used elsewhere in
 * this codebase (lib/permission/dataScope.clientPropagation.test.ts,
 * lib/permission/permissionCenter.clientPropagation.test.ts).
 *
 * getOrderDetail()/getOrderSummary()/getOrderEvents() (order.service.ts)
 * call the real order.repository functions directly via a namespace import
 * rather than through the injectable OrderRepository interface the rest of
 * order.service.test.ts's DI-based fakes use, so their coverage lives here
 * too, against a real (mocked-Supabase) module import rather than a fake
 * repository.
 */

interface FromCall {
  clientLabel: string;
  table: string;
}

/** A minimal, generic chainable fake: any method other than `from` just
 * returns the same chain (select/eq/order/single/maybeSingle all pass
 * through identically), and the chain itself is thenable, resolving to
 * whatever result is configured for the table `from()` was called with. */
function makeFakeClient(label: string, calls: FromCall[], results: Record<string, { data: unknown; error: unknown }>) {
  function makeChain(table: string): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const result = results[table] ?? { data: [], error: null };
            return (resolve: (v: unknown) => void) => resolve(result);
          }
          return () => makeChain(table);
        },
      }
    );
  }
  return {
    from(table: string) {
      calls.push({ clientLabel: label, table });
      return makeChain(table);
    },
  };
}

const fallbackCalls: FromCall[] = [];
const fallbackClient = makeFakeClient("fallback-anon", fallbackCalls, {
  orders: { data: { id: "order-1", order_number: "OD-1", customer_id: "customer-1" }, error: null },
  order_items: { data: [], error: null },
  payments: { data: [], error: null },
  order_events: { data: [], error: null },
});

// Mocked once at module scope, matching order.repository.test.ts's own
// documented convention for the same reason.
mock.module("@/lib/supabase", { namedExports: { supabase: fallbackClient } });

test.beforeEach(() => {
  fallbackCalls.length = 0;
});

test("findPaymentsByOrderId: with a client supplied, reads through that client, never the fallback", async () => {
  const { findPaymentsByOrderId } = await import("./order.repository");
  const calls: FromCall[] = [];
  const authenticatedClient = makeFakeClient("real-authenticated", calls, { payments: { data: [], error: null } });

  await findPaymentsByOrderId("order-1", authenticatedClient as never);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "payments");
  assert.equal(fallbackCalls.length, 0);
});

test("findPaymentsByOrderId: with no client, falls back to the anon-defaulting singleton (preserves existing behavior)", async () => {
  const { findPaymentsByOrderId } = await import("./order.repository");

  await findPaymentsByOrderId("order-1");

  assert.equal(fallbackCalls.length, 1);
  assert.equal(fallbackCalls[0].table, "payments");
});

test("findOrderEventsByOrderId: with a client supplied, reads through that client, never the fallback", async () => {
  const { findOrderEventsByOrderId } = await import("./order.repository");
  const calls: FromCall[] = [];
  const authenticatedClient = makeFakeClient("real-authenticated", calls, { order_events: { data: [], error: null } });

  await findOrderEventsByOrderId("order-1", authenticatedClient as never);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "order_events");
  assert.equal(fallbackCalls.length, 0);
});

test("findOrderEventsByOrderId: with no client, falls back to the anon-defaulting singleton (preserves existing behavior)", async () => {
  const { findOrderEventsByOrderId } = await import("./order.repository");

  await findOrderEventsByOrderId("order-1");

  assert.equal(fallbackCalls.length, 1);
  assert.equal(fallbackCalls[0].table, "order_events");
});

test("getOrderDetail: threads its own client into findPaymentsByOrderId/findOrderEventsByOrderId, never the fallback (BUG-002 Phase Order Payment Rollup fix)", async () => {
  const { getOrderDetail } = await import("./order.service");
  const calls: FromCall[] = [];
  const authenticatedClient = makeFakeClient("real-authenticated", calls, {
    orders: { data: { id: "order-1", order_number: "OD-1", customer_id: "customer-1" }, error: null },
    order_items: { data: [], error: null },
    payments: { data: [], error: null },
    order_events: { data: [], error: null },
  });

  await getOrderDetail("order-1", undefined, authenticatedClient as never);

  const paymentsCall = calls.find((c) => c.table === "payments");
  const eventsCall = calls.find((c) => c.table === "order_events");
  assert.equal(paymentsCall?.clientLabel, "real-authenticated");
  assert.equal(eventsCall?.clientLabel, "real-authenticated");
  assert.equal(
    fallbackCalls.some((c) => c.table === "payments" || c.table === "order_events"),
    false
  );
});

test("getOrderDetail: with no client, falls back to the anon-defaulting singleton for payments/order_events too (preserves existing behavior)", async () => {
  const { getOrderDetail } = await import("./order.service");

  await getOrderDetail("order-1");

  assert.ok(fallbackCalls.some((c) => c.table === "payments"));
  assert.ok(fallbackCalls.some((c) => c.table === "order_events"));
});
