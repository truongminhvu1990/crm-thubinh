import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import ExcelJS from "exceljs";
import { PaymentReportSourceRow } from "./paymentMethodReport.repository";

// order.service.test.ts's own precedent: this module transitively imports
// "@/lib/supabase" (a real client, throws without env vars) via
// paymentMethodReport.repository.ts -> "@/lib/permission" ->
// "@/lib/supabase". Every aggregateByPaymentMethod test below drives pure
// logic with plain arrays (no I/O), so this only needs to exist, never be
// called.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

function row(order_id: string, amount: number, payment_method: string): PaymentReportSourceRow {
  return { order_id, amount, payment_method };
}

test("aggregateByPaymentMethod: groups payments by method", async () => {
  const { aggregateByPaymentMethod } = await import("./paymentMethodReport.service");

  const rows = [row("o1", 5_000_000, "Cash"), row("o2", 3_000_000, "Bank Transfer")];
  const result = aggregateByPaymentMethod(rows);

  assert.equal(result.length, 2);
  const cash = result.find((r) => r.paymentMethod === "Cash")!;
  const bank = result.find((r) => r.paymentMethod === "Bank Transfer")!;
  assert.equal(cash.totalAmount, 5_000_000);
  assert.equal(bank.totalAmount, 3_000_000);
});

test("aggregateByPaymentMethod: Number of Orders uses COUNT(DISTINCT order_id)", async () => {
  const { aggregateByPaymentMethod } = await import("./paymentMethodReport.service");

  // Order A: two Cash payments. Order B: one Cash payment.
  const rows = [row("A", 5_000_000, "Cash"), row("A", 5_000_000, "Cash"), row("B", 2_000_000, "Cash")];
  const result = aggregateByPaymentMethod(rows);

  assert.equal(result.length, 1);
  assert.equal(result[0].orderCount, 2); // distinct: A, B
});

test("aggregateByPaymentMethod: worked example from the task — Order A, 5M + 5M", async () => {
  const { aggregateByPaymentMethod } = await import("./paymentMethodReport.service");

  const rows = [row("A", 5_000_000, "Cash"), row("A", 5_000_000, "Cash")];
  const result = aggregateByPaymentMethod(rows);

  assert.equal(result.length, 1);
  assert.equal(result[0].orderCount, 1);
  assert.equal(result[0].paymentCount, 2);
  assert.equal(result[0].totalAmount, 10_000_000);
});

test("aggregateByPaymentMethod: multiple payments on one Order never inflate Order count within a method", async () => {
  const { aggregateByPaymentMethod } = await import("./paymentMethodReport.service");

  const rows = [
    row("A", 1_000_000, "Cash"),
    row("A", 1_000_000, "Cash"),
    row("A", 1_000_000, "Cash"),
    row("B", 1_000_000, "Cash"),
  ];
  const result = aggregateByPaymentMethod(rows);

  assert.equal(result[0].orderCount, 2); // A, B — not 4
  assert.equal(result[0].paymentCount, 4);
});

test("aggregateByPaymentMethod: Number of Payments counts every payment row, not distinct orders", async () => {
  const { aggregateByPaymentMethod } = await import("./paymentMethodReport.service");

  const rows = [row("A", 100, "Cash"), row("A", 200, "Cash"), row("A", 300, "Cash")];
  const result = aggregateByPaymentMethod(rows);

  assert.equal(result[0].paymentCount, 3);
  assert.equal(result[0].totalAmount, 600);
});

test("aggregateByPaymentMethod: an Order with payments split across different methods appears once in each method's own row (not double-counting within a method)", async () => {
  const { aggregateByPaymentMethod } = await import("./paymentMethodReport.service");

  const rows = [row("A", 5_000_000, "Cash"), row("A", 5_000_000, "Bank Transfer")];
  const result = aggregateByPaymentMethod(rows);

  const cash = result.find((r) => r.paymentMethod === "Cash")!;
  const bank = result.find((r) => r.paymentMethod === "Bank Transfer")!;
  assert.equal(cash.orderCount, 1);
  assert.equal(cash.paymentCount, 1);
  assert.equal(bank.orderCount, 1);
  assert.equal(bank.paymentCount, 1);
});

test("aggregateByPaymentMethod: empty input produces an empty result (empty state)", async () => {
  const { aggregateByPaymentMethod } = await import("./paymentMethodReport.service");
  assert.deepEqual(aggregateByPaymentMethod([]), []);
});

/**
 * Filter application — a fake chainable query recorder standing in for the
 * Supabase PostgrestFilterBuilder, matching this codebase's own precedent
 * for testing method-chained query builders without a live database
 * (order.repository.test.ts's own fakes, adapted here). Every filter test
 * only asserts *that* the correct builder method/column/value was called,
 * never against a live table.
 */
interface RecordedCall {
  method: string;
  args: unknown[];
}

function makeFakeQuery() {
  const calls: RecordedCall[] = [];
  const handler = {
    get(_target: object, prop: string) {
      if (prop === "then") return undefined; // never accidentally treated as a thenable mid-chain
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy: Record<string, (...args: unknown[]) => unknown> = new Proxy({}, handler) as never;
  return { proxy, calls };
}

test("applyFilters (via findPaymentsForReport's query building): month resolves to a [start, end) payment_date range", async () => {
  mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
  mock.module("@/lib/permission/dataScope", { namedExports: { applyDataScopeByName: async (q: unknown) => ({ query: q }) } });
  const { findPaymentsForReport } = await import("./paymentMethodReport.repository");

  const { proxy, calls } = makeFakeQuery();
  const fakeClient = { from: () => proxy } as never;

  await findPaymentsForReport({ month: "2026-07" }, fakeClient, null);

  const gte = calls.find((c) => c.method === "gte");
  const lt = calls.find((c) => c.method === "lt");
  assert.deepEqual(gte?.args, ["payment_date", "2026-07-01"]);
  assert.deepEqual(lt?.args, ["payment_date", "2026-08-01"]);
});

test("applyFilters: explicit dateFrom/dateTo apply directly to payment_date when no month is set", async () => {
  const { findPaymentsForReport } = await import("./paymentMethodReport.repository");
  const { proxy, calls } = makeFakeQuery();
  const fakeClient = { from: () => proxy } as never;

  await findPaymentsForReport({ dateFrom: "2026-07-01", dateTo: "2026-07-15" }, fakeClient, null);

  const gte = calls.find((c) => c.method === "gte");
  const lt = calls.find((c) => c.method === "lt");
  assert.deepEqual(gte?.args, ["payment_date", "2026-07-01"]);
  assert.deepEqual(lt?.args, ["payment_date", "2026-07-15"]);
});

test("applyFilters: staff filter matches orders.sales_owner", async () => {
  const { findPaymentsForReport } = await import("./paymentMethodReport.repository");
  const { proxy, calls } = makeFakeQuery();
  const fakeClient = { from: () => proxy } as never;

  await findPaymentsForReport({ salesperson: "Nguyễn Văn A" }, fakeClient, null);

  const eq = calls.find((c) => c.method === "eq" && c.args[0] === "orders.sales_owner");
  assert.deepEqual(eq?.args, ["orders.sales_owner", "Nguyễn Văn A"]);
});

test("applyFilters: payment method filter matches payment_method exactly", async () => {
  const { findPaymentsForReport } = await import("./paymentMethodReport.repository");
  const { proxy, calls } = makeFakeQuery();
  const fakeClient = { from: () => proxy } as never;

  await findPaymentsForReport({ paymentMethod: "Cash" }, fakeClient, null);

  const eq = calls.find((c) => c.method === "eq" && c.args[0] === "payment_method");
  assert.deepEqual(eq?.args, ["payment_method", "Cash"]);
});

test("export: contains exactly the four defined fields, in order, matching the given (already-filtered) rows", async () => {
  const { exportPaymentMethodReportToExcel } = await import("./paymentMethodReportExport");

  const rows = [
    { paymentMethod: "Cash", orderCount: 2, paymentCount: 3, totalAmount: 15_000_000 },
    { paymentMethod: "Bank Transfer", orderCount: 1, paymentCount: 1, totalAmount: 5_000_000 },
  ];
  const blob = await exportPaymentMethodReportToExcel(rows);
  const arrayBuffer = await blob.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];

  // ExcelJS's Row.values is 1-indexed with a sparse hole at index 0 rather
  // than a literal `undefined` — sliced off both sides rather than asserted
  // on, since that hole is a library implementation detail, not part of
  // this report's field definition.
  assert.deepEqual(
    (sheet.getRow(1).values as unknown[]).slice(1),
    ["Phương thức thanh toán", "Số đơn hàng", "Số lượt thanh toán", "Tổng số tiền"]
  );
  assert.deepEqual((sheet.getRow(2).values as unknown[]).slice(1), ["Cash", 2, 3, 15_000_000]);
  assert.deepEqual((sheet.getRow(3).values as unknown[]).slice(1), ["Bank Transfer", 1, 1, 5_000_000]);
  assert.equal(sheet.rowCount, 3); // header + exactly the 2 rows passed in — no extra fields, no extra rows
});

test("drill-down export: extends the shared Excel writer (reportsBIExport.ts), same fields/order as the drill-down table", async () => {
  const { exportPaymentMethodDrillDownToExcel } = await import("./paymentMethodReportExport");
  const { formatDate } = await import("@/lib/utils");

  const rows = [
    {
      orderId: "o1",
      orderNumber: "000001",
      orderDate: "2026-08-01",
      productId: "prod1",
      productCode: "SP01",
      productName: "Vòng ngọc",
      customerId: "c1",
      customerName: "Khách A",
      customerCode: "KH01",
      saleAmount: 9_500_000,
      amountPaid: 6_000_000,
      remainingBalance: 3_500_000,
      paymentMethods: "Tiền mặt",
    },
  ];
  const blob = await exportPaymentMethodDrillDownToExcel("Tiền mặt", rows);
  const arrayBuffer = await blob.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];

  assert.deepEqual(
    (sheet.getRow(1).values as unknown[]).slice(1),
    ["Mã đơn hàng", "Mã sản phẩm", "Tên sản phẩm", "Khách hàng", "Giá bán", "Đã thanh toán", "Tiền còn lại", "Ngày bán", "Phương thức thanh toán"]
  );
  assert.deepEqual(
    (sheet.getRow(2).values as unknown[]).slice(1),
    ["000001", "SP01", "Vòng ngọc", "Khách A (KH01)", 9_500_000, 6_000_000, 3_500_000, formatDate("2026-08-01"), "Tiền mặt"]
  );
  assert.equal(sheet.rowCount, 2);
});
