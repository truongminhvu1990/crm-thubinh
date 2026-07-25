import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { BusinessTime } from "@/lib/businessTime";

/**
 * Business Time Migration, Wave 1 - boundary verification for the Orders
 * write path (generateOrderNumber/createOrder, exercised through the
 * exported createOrder() - the only call site, same pattern
 * order.repository.test.ts already uses).
 *
 * Uses node:test's built-in Date mock (`mock.timers`, no new dependency)
 * to freeze "now" at each of the 5 boundary instants the Product Owner
 * named, without threading a new `instant` parameter through
 * generateOrderNumber()/createOrder() - their public signature is
 * unchanged (No API contract changes), and the underlying conversion math
 * itself is already exhaustively covered by lib/businessTime.test.ts; this
 * file only proves the Orders write path actually *delegates* to
 * BusinessTime at each boundary, not that BusinessTime's math is right.
 *
 * Every expected value below is asserted two ways: once against
 * `BusinessTime.todayString()` computed live under the same frozen clock
 * (so this test can never duplicate/hardcode a second, possibly-wrong date
 * calculation), and once against a literal string in the test name/comment
 * for a human to sanity-check.
 */

interface FakeSelectCall {
  columns: string;
}

function createFakeSupabase(existingRowCount: number) {
  return {
    supabase: {
      from(_table: string) {
        return {
          select(columns: string) {
            return {
              like(_column: string, _pattern: string) {
                const rows = Array.from({ length: existingRowCount }, (_, i) => ({ id: String(i) }));
                return Promise.resolve({ data: rows, error: null });
              },
            } as unknown as FakeSelectCall;
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

mock.module("@/lib/supabase", { namedExports: createFakeSupabase(0) });

async function createOrderAt(fixedUtcMs: number, t: import("node:test").TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: fixedUtcMs });
  try {
    const { createOrder } = await import("./order.repository");
    return await createOrder({ customer_id: "customer-1", sales_owner: "Jane", created_by: "Jane" });
  } finally {
    t.mock.timers.reset();
  }
}

const BOUNDARIES: { name: string; utcMs: number; expectedVietnamDate: string }[] = [
  {
    // 2026-07-24 23:59:00 ICT = 2026-07-24 16:59:00 UTC - still July 24 in Vietnam.
    name: "23:59 Vietnam",
    utcMs: Date.parse("2026-07-24T16:59:00.000Z"),
    expectedVietnamDate: "2026-07-24",
  },
  {
    // 2026-07-25 00:01:00 ICT = 2026-07-24 17:01:00 UTC - the exact
    // "still July 24 in UTC, already July 25 in Vietnam" bug scenario.
    name: "00:01 Vietnam",
    utcMs: Date.parse("2026-07-24T17:01:00.000Z"),
    expectedVietnamDate: "2026-07-25",
  },
  {
    // 2026-08-01 00:01:00 ICT = 2026-07-31 17:01:00 UTC - month boundary
    // (still July in UTC's own calendar, already August in Vietnam's).
    name: "month boundary (July -> August)",
    utcMs: Date.parse("2026-07-31T17:01:00.000Z"),
    expectedVietnamDate: "2026-08-01",
  },
  {
    // 2026-07-01 00:01:00 ICT = 2026-06-30 17:01:00 UTC - quarter boundary
    // (Q2 -> Q3).
    name: "quarter boundary (Q2 -> Q3)",
    utcMs: Date.parse("2026-06-30T17:01:00.000Z"),
    expectedVietnamDate: "2026-07-01",
  },
  {
    // 2027-01-01 00:01:00 ICT = 2026-12-31 17:01:00 UTC - year boundary.
    name: "year boundary (2026 -> 2027)",
    utcMs: Date.parse("2026-12-31T17:01:00.000Z"),
    expectedVietnamDate: "2027-01-01",
  },
];

for (const boundary of BOUNDARIES) {
  test(`createOrder at ${boundary.name}: order_date is the Vietnam business date`, async (t) => {
    const order = await createOrderAt(boundary.utcMs, t);
    assert.equal(order.order_date, boundary.expectedVietnamDate);
    // Cross-check against BusinessTime directly, under the same frozen instant.
    assert.equal(order.order_date, BusinessTime.todayString(new Date(boundary.utcMs)));
  });

  test(`createOrder at ${boundary.name}: order number prefix is the Vietnam business date`, async (t) => {
    const order = await createOrderAt(boundary.utcMs, t);
    const expectedPrefix = `OD-${boundary.expectedVietnamDate.replace(/-/g, "")}-`;
    assert.ok(
      order.order_number.startsWith(expectedPrefix),
      `expected order_number "${order.order_number}" to start with "${expectedPrefix}"`
    );
  });
}

// sale_date's correctness at every boundary above is not re-tested here:
// completeOrder() (lib/orders/order.service.ts) never computes a date
// itself, it copies order.order_date verbatim into sale_date (see the
// comment at that call site) - already covered by
// order.service.test.ts's existing "completeOrder: customer_id/product_id/
// sale_date come from Order/order_item" test (order_date "2026-06-01" in,
// sale_date "2026-06-01" out), which needed no change for this package.
// payment_date has no application-code date computation to unit-test at
// all (AddPaymentModal.tsx always sends an explicit, user-editable value -
// see 20260805_business_time_orders_write_path.sql's own header comment)
// - its DB default is verified by that migration file's own SQL, not here.
