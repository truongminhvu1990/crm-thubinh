import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { BusinessTime } from "@/lib/businessTime";

/**
 * Regression coverage for generateOrderNumber() (private to order.repository.ts,
 * exercised here through the exported createOrder(), the only call site).
 *
 * Prior to this fix, the counting query used `.select("id", { count: "exact",
 * head: true })` — a HEAD request that Supabase/PostgREST returned HTTP 400
 * for in production. The fix replaced it with a plain GET selecting "id" and
 * deriving the count from the returned array's length. This test pins both:
 * the sequence-number arithmetic still working, and the query shape never
 * regressing back to `head`/`count`.
 */

interface FakeSelectCall {
  columns: string;
  options?: { count?: string; head?: boolean };
}

function createFakeSupabase(existingRowCount: number, selectCalls: FakeSelectCall[]) {
  return {
    supabase: {
      from(_table: string) {
        return {
          select(columns: string, options?: { count?: string; head?: boolean }) {
            selectCalls.push({ columns, options });
            return {
              like(_column: string, _pattern: string) {
                const rows = Array.from({ length: existingRowCount }, (_, i) => ({ id: String(i) }));
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
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
const selectCalls: FakeSelectCall[] = [];
mock.module("@/lib/supabase", { namedExports: createFakeSupabase(3, selectCalls) });

test("generateOrderNumber (via createOrder): sequence and query shape", async (t) => {
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

  await t.test("computes the next sequence from the row count (3 existing -> 000004)", () => {
    assert.equal(order.order_number, `OD-${datePart}-000004`);
  });

  await t.test("sets order_date to the Vietnam business date", () => {
    assert.equal(order.order_date, todayString);
  });

  await t.test("issues a plain GET select — no head/count on the counting query", () => {
    assert.equal(selectCalls.length, 1);
    assert.equal(selectCalls[0].columns, "id");
    assert.equal(selectCalls[0].options?.head, undefined);
    assert.equal(selectCalls[0].options?.count, undefined);
  });
});

/**
 * Order Sale Date (Backdated Order support) — createOrder() must honor a
 * caller-supplied order_date (a user entering a backdated sale) instead of
 * always defaulting to today's Vietnam business date. Omitting order_date
 * entirely (existing call sites, e.g. the test above) must keep defaulting
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
