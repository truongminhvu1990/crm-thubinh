import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { BusinessTime } from "@/lib/businessTime";

/**
 * Regression coverage for generateOrderNumber() (private to order.repository.ts,
 * exercised here through the exported createOrder(), the only call site).
 *
 * BUG-ORDER-LIFECYCLE-001 Phase 1: generateOrderNumber() now delegates the
 * sequence itself to the generate_order_sequence(p_business_date) RPC (a
 * persistent Postgres counter, supabase/migrations/2026082313_order_number_
 * sequence.sql) instead of counting today's rows — fixing both the
 * concurrent-creation race and the number-reuse-after-deletion bug the
 * prior row-count implementation had. This file's fake mocks that RPC
 * directly: `rpcSequence` configures what the next call returns, and
 * `rpcCalls` records the exact `p_business_date` argument each call
 * received, so these tests can pin the query shape as well as the
 * resulting order_number string.
 */

interface FakeRpcCall {
  fn: string;
  args?: Record<string, unknown>;
}

function createFakeSupabase(rpcCalls: FakeRpcCall[], nextSequence: () => number) {
  return {
    supabase: {
      rpc(fn: string, args?: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        return Promise.resolve({ data: nextSequence(), error: null });
      },
      from(_table: string) {
        return {
          insert(values: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: "fake-order-id", ...values }, error: null });
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

// Mocked once at module scope (not inside a test body) so every test() in
// this file can import order.repository against the same fake — node:test's
// mock.module() rejects mocking the same specifier twice within one process,
// and this file's tests all run in that one process.
//
// Sequence starts at 4 so the first call in this file's tests mirrors the
// prior implementation's "3 existing -> 000004" fixture value, keeping the
// assertions below easy to compare against the pre-fix test.
const rpcCalls: FakeRpcCall[] = [];
let mockSequence = 4;
mock.module("@/lib/supabase", {
  namedExports: createFakeSupabase(rpcCalls, () => mockSequence++),
});

/**
 * BUG-MONEY-DEBT-SYNC-001 follow-up (RPC client context fix) —
 * create_payment_with_ledger_sync is service_role-only (confirmed live on
 * Production via has_function_privilege: anon=false, authenticated=false,
 * service_role=true). addPaymentWithLedgerSync() now resolves its own
 * createAdminClient() for this call, exactly like deleteOrderWithReconciliation
 * a few functions above — never the caller-supplied client. This fake is
 * mocked separately from the `supabase` singleton above (a different
 * module, `@/lib/supabase/admin`) precisely so a test can prove the RPC
 * call lands on THIS fake and never on the plain `supabase` fake's own
 * `.rpc()` (recorded in `rpcCalls`) — that's the regression this fix closes.
 */
const adminRpcCalls: FakeRpcCall[] = [];
function fakeAdminClient() {
  return {
    rpc(fn: string, args?: Record<string, unknown>) {
      adminRpcCalls.push({ fn, args });
      return Promise.resolve({
        data: { id: "fake-payment-id", ...args, order_id: args?.p_order_id },
        error: null,
      });
    },
  };
}
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: fakeAdminClient },
});

test("generateOrderNumber (via createOrder): first generation uses the RPC and returns the configured sequence", async (t) => {
  const { createOrder } = await import("./order.repository");

  const order = await createOrder({
    customer_id: "customer-1",
    sales_owner: "Jane",
    created_by: "Jane",
  });

  // Business Time Migration, Wave 1: both the order number's date prefix and
  // order_date itself must come from BusinessTime (Vietnam business date),
  // not a runtime-local `new Date()` - asserting against BusinessTime's own
  // output (not a second, independently-computed date string) is the point:
  // this test must not duplicate date logic either.
  const todayString = BusinessTime.todayString();
  const datePart = todayString.replace(/-/g, "");

  await t.test("format unchanged: OD-{YYYYMMDD}-{6-digit sequence}", () => {
    assert.equal(order.order_number, `OD-${datePart}-000004`);
  });

  await t.test("sets order_date to the Vietnam business date", () => {
    assert.equal(order.order_date, todayString);
  });

  await t.test("calls generate_order_sequence with today's business date, not a live row count", () => {
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].fn, "generate_order_sequence");
    assert.deepEqual(rpcCalls[0].args, { p_business_date: todayString });
  });
});

test("generateOrderNumber (via createOrder): second sequential call the same day advances to the next counter value", async () => {
  const { createOrder } = await import("./order.repository");

  const order = await createOrder({
    customer_id: "customer-1",
    sales_owner: "Jane",
    created_by: "Jane",
  });

  const datePart = BusinessTime.todayString().replace(/-/g, "");

  // The module-scope fake's counter is shared across tests in this file (in
  // call order): the previous test consumed sequence 4, so this one must
  // receive 5 — proving the counter genuinely increments per call rather
  // than resetting or repeating, which is the exact bug this migration
  // fixes (the old count-based generator could reproduce the same sequence
  // twice after a deletion).
  assert.equal(order.order_number, `OD-${datePart}-000005`);
  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[1].fn, "generate_order_sequence");
});

/**
 * Order Sale Date (Backdated Order support) — createOrder() must honor a
 * caller-supplied order_date (a user entering a backdated sale) instead of
 * always defaulting to today's Vietnam business date. Omitting order_date
 * entirely (existing call sites, e.g. the tests above) must keep defaulting
 * to today — that behavior is unchanged and already covered above.
 */
test("createOrder: honors a caller-supplied order_date over today's business date", async () => {
  const { createOrder } = await import("./order.repository");

  const backdatedSaleDate = "2026-08-15";
  const order = await createOrder({
    customer_id: "customer-1",
    sales_owner: "Jane",
    created_by: "Jane",
    order_date: backdatedSaleDate,
  });

  assert.equal(order.order_date, backdatedSaleDate);
});

/**
 * BUG-MONEY-DEBT-SYNC-001 — addPaymentWithLedgerSync() calls
 * create_payment_with_ledger_sync (supabase/migrations/2026081721_money_
 * debt_ledger_automatic_sync.sql) instead of a plain payments insert. This
 * pins the exact RPC name and argument mapping from AddPaymentInput +
 * staffId, and confirms the returned row is passed through unchanged.
 */
test("addPaymentWithLedgerSync: calls create_payment_with_ledger_sync with the exact mapped arguments", async () => {
  const { addPaymentWithLedgerSync } = await import("./order.repository");
  adminRpcCalls.length = 0;

  const payment = await addPaymentWithLedgerSync(
    {
      order_id: "order-1",
      amount: 8100000,
      payment_method: "Bank Transfer",
      payment_date: "2026-08-24",
      receiving_account_id: "account-1",
    },
    "staff-1"
  );

  assert.equal(adminRpcCalls.length, 1);
  assert.equal(adminRpcCalls[0].fn, "create_payment_with_ledger_sync");
  assert.deepEqual(adminRpcCalls[0].args, {
    p_staff_id: "staff-1",
    p_order_id: "order-1",
    p_amount: 8100000,
    p_payment_method: "Bank Transfer",
    p_payment_date: "2026-08-24",
    p_note: null,
    p_receiving_account_id: "account-1",
  });
  assert.equal(payment.order_id, "order-1");
});

test("addPaymentWithLedgerSync: omitted note/receiving_account_id map to null, not undefined", async () => {
  const { addPaymentWithLedgerSync } = await import("./order.repository");
  adminRpcCalls.length = 0;

  await addPaymentWithLedgerSync(
    {
      order_id: "order-2",
      amount: 500000,
      payment_method: "Bank Transfer",
      payment_date: "2026-08-24",
    },
    "staff-2"
  );

  assert.equal(adminRpcCalls[0].args?.p_note, null);
  assert.equal(adminRpcCalls[0].args?.p_receiving_account_id, null);
});

/**
 * BUG-MONEY-DEBT-SYNC-001 — RPC client context fix, the regression test for
 * the actual reported Production failure ("permission denied for function
 * create_payment_with_ledger_sync"): confirms the RPC is invoked through the
 * admin/service_role client (createAdminClient()), never through a
 * caller-supplied regular client, even when one is explicitly passed —
 * exactly the caller-supplied `auditClient` shape order.service.ts's
 * addPayment() actually passes in production.
 */
test("addPaymentWithLedgerSync: uses the admin client, never the caller-supplied client, even when one is passed", async () => {
  const { addPaymentWithLedgerSync } = await import("./order.repository");
  adminRpcCalls.length = 0;
  rpcCalls.length = 0;
  const callerRpcCalls: FakeRpcCall[] = [];
  const fakeAuthenticatedClient = {
    rpc(fn: string, args?: Record<string, unknown>) {
      callerRpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: { message: "permission denied", code: "42501" } });
    },
  };

  await addPaymentWithLedgerSync(
    { order_id: "order-3", amount: 1000000, payment_method: "Bank Transfer", payment_date: "2026-08-24" },
    "staff-3",
    fakeAuthenticatedClient as never
  );

  assert.equal(adminRpcCalls.length, 1, "the admin client's rpc() must be called");
  assert.equal(callerRpcCalls.length, 0, "the caller-supplied client's rpc() must never be called");
  assert.equal(rpcCalls.length, 0, "the plain @/lib/supabase singleton must never be used for this RPC either");
});
