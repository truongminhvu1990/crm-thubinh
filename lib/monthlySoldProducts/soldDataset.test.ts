import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 1 - Reporting Foundation: summarizeSoldLines / groupSoldLinesByOrder.
 *
 * `oldSummary` is the VERBATIM inline arithmetic getMonthlySoldProductsSummary
 * contained before this phase (frozen as the reference). The Production Sold
 * release is the baseline: the shared summary must reproduce it exactly, for
 * every fixture below, so moving the arithmetic cannot change a single figure.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: { applyDataScopeWithFallback: async (q: unknown) => ({ query: q }), applyDataScopeByName: async (q: unknown) => ({ query: q }) },
});

interface Line {
  line_key: string;
  order_id: string | null;
  customer_id: string;
  recognition: "recognized" | "unrecognized";
  is_legacy: boolean;
  final_sale_price: number;
  sale_date: string;
  order_number: string | null;
  order_status: string | null;
  payment_status: string | null;
  customer_name: string;
  customer_code: string;
  salesperson: string | null;
  amount_paid: number | null;
  remaining_balance: number | null;
  payment_methods: string | null;
}

let n = 0;
function line(p: Partial<Line> & Pick<Line, "recognition" | "final_sale_price">): Line {
  n += 1;
  return {
    line_key: `L${n}`,
    order_id: `O${n}`,
    customer_id: `c${n}`,
    is_legacy: false,
    sale_date: "2026-09-10",
    order_number: `ORD-${n}`,
    order_status: "Completed",
    payment_status: "Paid",
    customer_name: `Khách ${n}`,
    customer_code: `KH${n}`,
    salesperson: "A",
    amount_paid: 0,
    remaining_balance: 0,
    payment_methods: null,
    ...p,
  };
}

// ---- frozen reference (pre-Phase-1, verbatim) ------------------------------
function oldSummary(lines: Line[]) {
  let recognizedRevenue = 0;
  let legacyRecognizedValue = 0;
  let unrecognizedValue = 0;
  for (const l of lines) {
    if (l.recognition === "recognized") {
      recognizedRevenue += l.final_sale_price;
      if (l.is_legacy) legacyRecognizedValue += l.final_sale_price;
    } else unrecognizedValue += l.final_sale_price;
  }
  const soldValue = recognizedRevenue + unrecognizedValue;
  const totalCustomers = new Set(lines.map((l) => l.customer_id)).size;
  const recognizedOrderIds = new Set<string>();
  const unrecognizedOrderIds = new Set<string>();
  let legacyCount = 0;
  for (const l of lines) {
    if (l.order_id === null) legacyCount += 1;
    else if (l.recognition === "recognized") recognizedOrderIds.add(l.order_id);
    else unrecognizedOrderIds.add(l.order_id);
  }
  const recognizedOrders = recognizedOrderIds.size + legacyCount;
  const unrecognizedOrders = unrecognizedOrderIds.size;
  return {
    soldValue, recognizedRevenue, legacyRecognizedValue, unrecognizedValue,
    soldLines: lines.length, totalCustomers,
    totalOrders: recognizedOrders + unrecognizedOrders, recognizedOrders, unrecognizedOrders,
    recognizedRatio: soldValue > 0 ? recognizedRevenue / soldValue : 0,
    recognizedOrderIds: [...recognizedOrderIds],
  };
}
// ----------------------------------------------------------------------------

function fixtures(): [string, Line[]][] {
  const sharedOrder = (id: string, recognition: "recognized" | "unrecognized", amounts: number[]) =>
    amounts.map((a) => line({ order_id: id, recognition, final_sale_price: a, customer_id: `cust-${id}` }));
  return [
    ["empty", []],
    ["one recognized order", sharedOrder("A", "recognized", [100])],
    ["one order with several lines", sharedOrder("B", "recognized", [40, 20, 5])],
    ["deposit + partially paid (unrecognized)", [...sharedOrder("C", "unrecognized", [200]), ...sharedOrder("D", "unrecognized", [50])]],
    ["BR-002 legacy entries are their own 'orders'", [
      line({ order_id: null, is_legacy: true, recognition: "recognized", final_sale_price: 25, order_number: null, order_status: null, payment_status: null }),
      line({ order_id: null, is_legacy: true, recognition: "recognized", final_sale_price: 5, order_number: null, order_status: null, payment_status: null }),
    ]],
    ["mixed", [
      ...sharedOrder("E", "recognized", [100]),
      ...sharedOrder("F", "recognized", [40, 20]),
      ...sharedOrder("G", "unrecognized", [200]),
      line({ order_id: null, is_legacy: true, recognition: "recognized", final_sale_price: 25 }),
    ]],
    ["zero-value lines", [...sharedOrder("H", "recognized", [0, 0]), ...sharedOrder("I", "unrecognized", [0])]],
  ];
}

test("summarizeSoldLines == the frozen pre-Phase-1 arithmetic for every fixture (Sold release not regressed)", async () => {
  const { summarizeSoldLines } = await import("./soldDataset");
  for (const [name, lines] of fixtures()) {
    assert.deepEqual(summarizeSoldLines(lines as never), oldSummary(lines), `diverged on: ${name}`);
  }
});

test("identities: SOLD = RECOGNIZED + UNRECOGNIZED and total orders = recognized + unrecognized, on every fixture", async () => {
  const { summarizeSoldLines } = await import("./soldDataset");
  for (const [name, lines] of fixtures()) {
    const s = summarizeSoldLines(lines as never);
    assert.equal(s.soldValue, s.recognizedRevenue + s.unrecognizedValue, name);
    assert.equal(s.totalOrders, s.recognizedOrders + s.unrecognizedOrders, name);
  }
});

test("groupSoldLinesByOrder: rows sum to soldValue exactly, one row per order (each legacy entry its own), order-level fields preserved", async () => {
  const { summarizeSoldLines, groupSoldLinesByOrder } = await import("./soldDataset");
  for (const [name, lines] of fixtures()) {
    const orders = groupSoldLinesByOrder(lines as never);
    const totals = summarizeSoldLines(lines as never);
    assert.equal(orders.reduce((s, o) => s + o.sold_value, 0), totals.soldValue, `${name}: sold_value rows sum to soldValue`);
    assert.equal(orders.length, totals.totalOrders, `${name}: one row per counted order`);
    assert.equal(orders.reduce((s, o) => s + o.product_count, 0), totals.soldLines, `${name}: every line belongs to exactly one row`);
  }
});

test("groupSoldLinesByOrder: a multi-line order is ONE row carrying its order-level payment figures; newest first", async () => {
  const { groupSoldLinesByOrder } = await import("./soldDataset");
  const lines = [
    line({ order_id: "X", recognition: "unrecognized", final_sale_price: 150, order_number: "ORD-X", sale_date: "2026-09-02", amount_paid: 50, remaining_balance: 150, payment_methods: "Tiền mặt" }),
    line({ order_id: "X", recognition: "unrecognized", final_sale_price: 50, order_number: "ORD-X", sale_date: "2026-09-02", amount_paid: 50, remaining_balance: 150, payment_methods: "Tiền mặt" }),
    line({ order_id: "Y", recognition: "recognized", final_sale_price: 10, order_number: "ORD-Y", sale_date: "2026-09-09" }),
  ];
  const orders = groupSoldLinesByOrder(lines as never);
  assert.deepEqual(orders.map((o) => o.order_number), ["ORD-Y", "ORD-X"], "newest first");
  const x = orders.find((o) => o.order_number === "ORD-X")!;
  assert.deepEqual([x.product_count, x.sold_value, x.amount_paid, x.remaining_balance, x.payment_methods], [2, 200, 50, 150, "Tiền mặt"], "payment figures are the ORDER's, not summed per line");
});
