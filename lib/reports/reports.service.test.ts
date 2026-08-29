import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// getPurchaseReportData backs the Dashboard's "Doanh thu đã ghi nhận" card
// (Revenue Management Visibility, 2026-08-29) and is the one Recognized
// Revenue source of truth reused everywhere else this task adds. BR-001
// (docs/03_ORDER_SPEC.md SS14/SS15 item 10, LOCKED): revenue counts only
// when a linked order is Completed AND Paid; a row with no linked order at
// all (order_item_id NULL - legacy/manual, BR-002) always counts. This file
// had no direct test coverage before this task.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakePurchaseRow {
  customer_id: string;
  product_id: string | null;
  sale_price: number;
  sale_date: string;
  source: string | null;
  salesperson: string | null;
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
  customer: { full_name: string } | null;
}

/** Minimal fake covering exactly the one query getPurchaseReportData makes
 * when called with `range: null` and `staff: null` (skips both the
 * `.gte()/.lt()` date-range chain and Data Scope resolution entirely) -
 * `product_id: null` on every row below also skips the second
 * (`products`) query, so `.from("customer_purchases").select(...)` is the
 * only call this fake needs to answer. */
function fakeClient(rows: FakePurchaseRow[]) {
  return {
    from: (table: string) => {
      assert.equal(table, "customer_purchases");
      return {
        select: async () => ({ data: rows, error: null }),
      };
    },
  } as never;
}

function row(
  order: { order_status: string; payment_status: string } | null,
  overrides: Partial<FakePurchaseRow> = {}
): FakePurchaseRow {
  return {
    customer_id: "cust-1",
    product_id: null,
    sale_price: 1_000_000,
    sale_date: "2026-08-15",
    source: "Facebook",
    salesperson: "Nguyen Van A",
    order_item_id: order ? "item-1" : null,
    order_items: order ? { orders: order } : null,
    customer: { full_name: "Nguyen Thi B" },
    ...overrides,
  };
}

test("getPurchaseReportData: Completed + Paid order-linked row contributes to Recognized Revenue", async () => {
  const { getPurchaseReportData } = await import("./reports.service");
  const client = fakeClient([row({ order_status: "Completed", payment_status: "Paid" })]);

  const result = await getPurchaseReportData(null, client, null);

  assert.equal(result.totalRevenue, 1_000_000);
});

test("getPurchaseReportData: Completed + Partially Paid does NOT contribute", async () => {
  const { getPurchaseReportData } = await import("./reports.service");
  const client = fakeClient([row({ order_status: "Completed", payment_status: "Partially Paid" })]);

  const result = await getPurchaseReportData(null, client, null);

  assert.equal(result.totalRevenue, 0);
});

test("getPurchaseReportData: Completed + Unpaid does NOT contribute", async () => {
  const { getPurchaseReportData } = await import("./reports.service");
  const client = fakeClient([row({ order_status: "Completed", payment_status: "Unpaid" })]);

  const result = await getPurchaseReportData(null, client, null);

  assert.equal(result.totalRevenue, 0);
});

test("getPurchaseReportData: Draft/Reserved + Paid does NOT contribute (Order Status leg still required)", async () => {
  const { getPurchaseReportData } = await import("./reports.service");
  const client = fakeClient([
    row({ order_status: "Draft", payment_status: "Paid" }),
    row({ order_status: "Reserved", payment_status: "Paid" }),
  ]);

  const result = await getPurchaseReportData(null, client, null);

  assert.equal(result.totalRevenue, 0);
});

test("getPurchaseReportData: legacy row with no linked order always counts (BR-002)", async () => {
  const { getPurchaseReportData } = await import("./reports.service");
  const client = fakeClient([row(null)]);

  const result = await getPurchaseReportData(null, client, null);

  assert.equal(result.totalRevenue, 1_000_000);
});

test("getPurchaseReportData: mixed rows sum only the recognized subset, transactions count every row", async () => {
  const { getPurchaseReportData } = await import("./reports.service");
  const client = fakeClient([
    row({ order_status: "Completed", payment_status: "Paid" }, { sale_price: 2_521_400_000 }),
    row({ order_status: "Completed", payment_status: "Partially Paid" }, { sale_price: 78_000_000 }),
    row({ order_status: "Draft", payment_status: "Paid" }, { sale_price: 238_920_000 }),
  ]);

  const result = await getPurchaseReportData(null, client, null);

  assert.equal(result.totalRevenue, 2_521_400_000, "only the Completed+Paid row counts toward revenue");
});
