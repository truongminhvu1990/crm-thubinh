import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

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

test("generateOrderNumber (via createOrder): sequence and query shape", async (t) => {
  const selectCalls: FakeSelectCall[] = [];
  mock.module("@/lib/supabase", { namedExports: createFakeSupabase(3, selectCalls) });

  const { createOrder } = await import("./order.repository");

  const order = await createOrder({
    customer_id: "customer-1",
    sales_owner: "Jane",
    created_by: "Jane",
  });

  const today = new Date();
  const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  await t.test("computes the next sequence from the row count (3 existing -> 000004)", () => {
    assert.equal(order.order_number, `OD-${datePart}-000004`);
  });

  await t.test("issues a plain GET select — no head/count on the counting query", () => {
    assert.equal(selectCalls.length, 1);
    assert.equal(selectCalls[0].columns, "id");
    assert.equal(selectCalls[0].options?.head, undefined);
    assert.equal(selectCalls[0].options?.count, undefined);
  });
});
