import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// getOrderValueSummary backs the Dashboard's new "Tổng giá trị đơn hàng" /
// "Giá trị đơn chưa ghi nhận" cards (Revenue Management Visibility,
// 2026-08-29). It deliberately never computes a "recognized revenue"
// figure of its own — Recognized Revenue stays exclusively
// getPurchaseReportData()'s (lib/reports/reports.service.ts, unchanged).
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeByName: async () => {
      throw new Error("applyDataScopeByName must not be called when staff is omitted");
    },
  },
});

interface FakeOrderRow {
  order_status: string;
  payment_status: string;
  total_amount: number;
}

interface QueryCalls {
  table?: string;
  neq?: [string, string];
  gte?: [string, string];
  lt?: [string, string];
}

function fakeClient(rows: FakeOrderRow[], calls: QueryCalls = {}) {
  return {
    from: (table: string) => {
      calls.table = table;
      const builder = {
        select: () => builder,
        neq: (col: string, val: string) => {
          calls.neq = [col, val];
          return builder;
        },
        gte: (col: string, val: string) => {
          calls.gte = [col, val];
          return builder;
        },
        lt: (col: string, val: string) => {
          calls.lt = [col, val];
          return builder;
        },
        then: (resolve: (r: { data: FakeOrderRow[]; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as never;
}

function order(order_status: string, payment_status: string, total_amount: number): FakeOrderRow {
  return { order_status, payment_status, total_amount };
}

test("getOrderValueSummary: Completed + Paid contributes to Total Order Value and orderBasedRecognizedValue, excluded from the breakdown / orderBasedUnrecognizedValue", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const client = fakeClient([order("Completed", "Paid", 2_521_400_000)]);

  const result = await getOrderValueSummary(null, undefined, client);

  assert.equal(result.totalOrderValue, 2_521_400_000);
  assert.equal(result.orderBasedRecognizedValue, 2_521_400_000);
  assert.equal(result.orderBasedUnrecognizedValue, 0);
  assert.deepEqual(result.breakdown, []);
});

test("getOrderValueSummary: Completed + Partial, Draft (+Paid/Partial/Unpaid), and Reserved + Paid all contribute to Total Order Value and orderBasedUnrecognizedValue, excluded from orderBasedRecognizedValue", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const client = fakeClient([
    order("Completed", "Partially Paid", 78_000_000),
    order("Draft", "Paid", 238_920_000),
    order("Draft", "Partially Paid", 663_100_000),
    order("Draft", "Unpaid", 39_000_000),
    order("Reserved", "Paid", 42_000_000),
  ]);

  const result = await getOrderValueSummary(null, undefined, client);

  assert.equal(result.totalOrderValue, 1_061_020_000);
  assert.equal(result.totalOrderCount, 5);
  assert.equal(result.orderBasedRecognizedValue, 0, "none of these groups is Completed+Paid");
  assert.equal(result.orderBasedUnrecognizedValue, 1_061_020_000);
  assert.equal(result.breakdown.length, 5, "every distinct (status, payment_status) group appears exactly once");
  const byKey = new Map(result.breakdown.map((r) => [`${r.order_status}|${r.payment_status}`, r]));
  assert.deepEqual(byKey.get("Completed|Partially Paid"), { order_status: "Completed", payment_status: "Partially Paid", count: 1, total: 78_000_000 });
  assert.deepEqual(byKey.get("Draft|Paid"), { order_status: "Draft", payment_status: "Paid", count: 1, total: 238_920_000 });
  assert.deepEqual(byKey.get("Draft|Partially Paid"), { order_status: "Draft", payment_status: "Partially Paid", count: 1, total: 663_100_000 });
  assert.deepEqual(byKey.get("Draft|Unpaid"), { order_status: "Draft", payment_status: "Unpaid", count: 1, total: 39_000_000 });
  assert.deepEqual(byKey.get("Reserved|Paid"), { order_status: "Reserved", payment_status: "Paid", count: 1, total: 42_000_000 });
});

test("getOrderValueSummary: audited August 2026 Orders-only shape — totalOrderValue = orderBasedRecognizedValue + orderBasedUnrecognizedValue exactly (no legacy revenue involved, this module never sees customer_purchases)", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const client = fakeClient([
    order("Completed", "Paid", 2_521_400_000),
    order("Completed", "Partially Paid", 78_000_000),
    order("Draft", "Paid", 238_920_000),
    order("Draft", "Partially Paid", 663_100_000),
    order("Draft", "Unpaid", 39_000_000),
    order("Reserved", "Paid", 42_000_000),
  ]);

  const result = await getOrderValueSummary(null, undefined, client);

  assert.equal(result.totalOrderValue, 3_582_420_000, "Total Order Value = A from the audit");
  assert.equal(result.orderBasedRecognizedValue, 2_521_400_000);
  assert.equal(result.orderBasedUnrecognizedValue, 1_061_020_000);
  assert.equal(
    result.orderBasedRecognizedValue + result.orderBasedUnrecognizedValue,
    result.totalOrderValue,
    "Order population identity: Total Order Value = Order-based Recognized Value + Order-based Unrecognized Value"
  );
  const breakdownSum = result.breakdown.reduce((sum, r) => sum + r.total, 0);
  assert.equal(breakdownSum, result.orderBasedUnrecognizedValue, "breakdown sums to orderBasedUnrecognizedValue exactly, by construction");
});

test("getOrderValueSummary: multiple orders in the same (status, payment_status) group aggregate, never double-count or overwrite", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const client = fakeClient([order("Draft", "Unpaid", 10_000_000), order("Draft", "Unpaid", 5_000_000)]);

  const result = await getOrderValueSummary(null, undefined, client);

  assert.equal(result.breakdown.length, 1);
  assert.deepEqual(result.breakdown[0], { order_status: "Draft", payment_status: "Unpaid", count: 2, total: 15_000_000 });
});

test("getOrderValueSummary: Lost orders are excluded at the query level, not merely uncounted client-side", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const calls: QueryCalls = {};
  const client = fakeClient([order("Draft", "Unpaid", 39_000_000)], calls);

  await getOrderValueSummary(null, undefined, client);

  assert.equal(calls.table, "orders");
  assert.deepEqual(calls.neq, ["order_status", "Lost"]);
});

test("getOrderValueSummary: date range filters by order_date, not sale_date", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const calls: QueryCalls = {};
  const client = fakeClient([], calls);

  await getOrderValueSummary({ start: "2026-08-01", end: "2026-09-01" }, undefined, client);

  assert.deepEqual(calls.gte, ["order_date", "2026-08-01"]);
  assert.deepEqual(calls.lt, ["order_date", "2026-09-01"]);
});

test("getOrderValueSummary: null range applies no date filter (all-time)", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const calls: QueryCalls = {};
  const client = fakeClient([], calls);

  await getOrderValueSummary(null, undefined, client);

  assert.equal(calls.gte, undefined);
  assert.equal(calls.lt, undefined);
});

test("getOrderValueSummary: empty result set produces all-zero summary, not an error", async () => {
  const { getOrderValueSummary } = await import("./orderValueSummary.service");
  const client = fakeClient([]);

  const result = await getOrderValueSummary(null, undefined, client);

  assert.deepEqual(result, {
    totalOrderValue: 0,
    totalOrderCount: 0,
    orderBasedRecognizedValue: 0,
    orderBasedUnrecognizedValue: 0,
    breakdown: [],
  });
});
