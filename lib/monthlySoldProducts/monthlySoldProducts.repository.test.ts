import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { makeFakeReportingClient, SEPTEMBER_SCENARIO, FakeData } from "./fakeReportingClient.testutil";

// The repository transitively imports "@/lib/supabase" (throws without env
// vars) and the permission modules. Every test passes `staff: null`
// explicitly, which skips the Data Scope calls - these mocks only let the
// module graph load.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", {
  namedExports: {
    applyDataScopeWithFallback: async (q: unknown) => ({ query: q }),
    applyDataScopeByName: async (q: unknown) => ({ query: q }),
  },
});

let getSoldLines: typeof import("./monthlySoldProducts.repository").getSoldLines;

before(async () => {
  ({ getSoldLines } = await import("./monthlySoldProducts.repository"));
});

const SEPT = { page: 1, month: "2026-09" };
const client = (data: FakeData = SEPTEMBER_SCENARIO) => makeFakeReportingClient(data) as never;

test("scope: sold lines = Completed (any payment) + Reserved with a deposit + legacy; Draft, Reserved-unpaid, Lost and out-of-range are excluded", async () => {
  const lines = await getSoldLines(SEPT, client(), null);
  const keys = lines.map((l) => l.line_key).sort();
  assert.deepEqual(keys, ["I1", "I2a", "I2b", "I3", "I4", "L1"]);
});

test("Completed + Paid lines are recognized; Completed-partial and Reserved-deposit lines are kept but unrecognized (not dropped by BR-001)", async () => {
  const lines = await getSoldLines(SEPT, client(), null);
  const by = (k: string) => lines.find((l) => l.line_key === k)!;
  assert.equal(by("I1").recognition, "recognized");
  assert.equal(by("I2a").recognition, "recognized");
  assert.equal(by("I3").recognition, "unrecognized", "Completed + PartiallyPaid");
  assert.equal(by("I4").recognition, "unrecognized", "Reserved + deposit");
  assert.equal(by("I4").order_status, "Reserved");
  assert.equal(by("L1").recognition, "recognized", "BR-002 legacy entry, unchanged");
  assert.equal(by("L1").is_legacy, true);
  assert.equal(by("L1").order_id, null);
});

test("Reserved-deposit line has no purchase snapshot: amount falls back to the order item's line total, purchase_id null", async () => {
  const lines = await getSoldLines(SEPT, client(), null);
  const l = lines.find((x) => x.line_key === "I4")!;
  assert.equal(l.purchase_id, null);
  assert.equal(l.final_sale_price, 200);
  assert.equal(l.original_price, 200);
  assert.equal(l.order_number, "ORD-O4");
});

test("Completed line uses the frozen customer_purchases snapshot amount", async () => {
  const data: FakeData = JSON.parse(JSON.stringify(SEPTEMBER_SCENARIO));
  data.purchases.find((p) => p.id === "P1")!.sale_price = 95; // snapshot differs from the item's live line total
  const lines = await getSoldLines(SEPT, client(data), null);
  const l = lines.find((x) => x.line_key === "I1")!;
  assert.equal(l.final_sale_price, 95);
  assert.equal(l.purchase_id, "P1");
});

test("no duplicate counting: an order with two items yields exactly two lines, each item once", async () => {
  const lines = await getSoldLines(SEPT, client(), null);
  assert.equal(lines.filter((l) => l.order_id === "O2").length, 2);
  assert.equal(new Set(lines.map((l) => l.line_key)).size, lines.length);
});

test("date basis is the Order's order_date (an October order with a September-dated purchase is NOT in September)", async () => {
  const data: FakeData = JSON.parse(JSON.stringify(SEPTEMBER_SCENARIO));
  data.purchases.find((p) => p.id === "P8")!.sale_date = "2026-09-30"; // purchase date in Sep, order_date in Oct
  const lines = await getSoldLines(SEPT, client(data), null);
  assert.equal(lines.some((l) => l.line_key === "I8"), false);
});

test("Payment Details: amount_paid / remaining_balance / payment_methods are Order-level and populated for deposit orders too", async () => {
  const lines = await getSoldLines(SEPT, client(), null);
  const l = lines.find((x) => x.line_key === "I4")!;
  assert.equal(l.amount_paid, 50);
  assert.equal(l.remaining_balance, 150);
  assert.equal(l.payment_methods, "Chuyển khoản");
});

test("Payment Details: legacy entry with no Order — all three payment fields null, original_price/discount null", async () => {
  const lines = await getSoldLines(SEPT, client(), null);
  const l = lines.find((x) => x.line_key === "L1")!;
  assert.equal(l.original_price, null);
  assert.equal(l.amount_paid, null);
  assert.equal(l.remaining_balance, null);
  assert.equal(l.payment_methods, null);
});

test("customer / category filters apply in memory; results are newest first", async () => {
  const byCustomer = await getSoldLines({ ...SEPT, customer: "kh04" }, client(), null);
  assert.deepEqual(byCustomer.map((l) => l.line_key), ["I4"]);

  const none = await getSoldLines({ ...SEPT, productCategory: "Nhẫn" }, client(), null);
  assert.equal(none.length, 0);

  const all = await getSoldLines(SEPT, client(), null);
  const dates = all.map((l) => l.sale_date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("salesperson filter: purchase snapshot matches by salesperson_id, a deposit line with no snapshot matches by the Order's sales_owner name", async () => {
  const lines = await getSoldLines({ ...SEPT, salespersonId: "staff-a" }, client(), null);
  assert.ok(lines.some((l) => l.line_key === "I1"), "snapshot matched by id");
  assert.ok(lines.some((l) => l.line_key === "I4"), "no snapshot: matched by sales_owner = staff full_name");
  const other = await getSoldLines({ ...SEPT, salespersonId: "staff-zzz" }, client(), null);
  assert.equal(other.length, 0);
});

// ---------------------------------------------------------------------------
// "Reserved counts as Sold only with at least one ACTUAL payment": decided
// from payment RECORDS keyed to the order, never from orders.payment_status.
// ---------------------------------------------------------------------------

function withReservedEdgeCases(): FakeData {
  const data: FakeData = JSON.parse(JSON.stringify(SEPTEMBER_SCENARIO));
  const base = data.orders.find((o) => o.id === "O4")!;
  const item = data.orderItems.find((i) => i.id === "I4")!;
  const order = (id: string, status: string, pay: string, total: number) => ({ ...base, id, order_number: `ORD-${id}`, order_status: status, payment_status: pay, total_amount: total });
  const line = (id: string, orderId: string, price: number) => ({ ...item, id, order_id: orderId, snapshot_sale_price: price });

  data.orders.push(
    order("R1", "Reserved", "PartiallyPaid", 70), // status SAYS deposit, but no payment record exists
    order("R2", "Reserved", "Paid", 80), // status says Paid, no payment record
    order("R3", "Reserved", "Unpaid", 90) // status says Unpaid, but a real payment record exists
  );
  data.orderItems.push(line("IR1", "R1", 70), line("IR2", "R2", 80), line("IR3", "R3", 90));
  data.payments.push({ order_id: "R3", amount: 10, payment_method: "Tiền mặt" });
  return data;
}

test("Reserved + payment_status that merely SAYS PartiallyPaid/Paid but has NO payment record is NOT Sold", async () => {
  const lines = await getSoldLines(SEPT, client(withReservedEdgeCases()), null);
  const keys = lines.map((l) => l.line_key);
  assert.equal(keys.includes("IR1"), false, "PartiallyPaid status without a payment record");
  assert.equal(keys.includes("IR2"), false, "Paid status without a payment record");
});

test("Reserved with a real payment record IS Sold and Unrecognized, even if payment_status reads Unpaid — the record, not the derived status, is the evidence", async () => {
  const lines = await getSoldLines(SEPT, client(withReservedEdgeCases()), null);
  const l = lines.find((x) => x.line_key === "IR3");
  assert.ok(l, "Reserved order R3 has a payment row");
  assert.equal(l!.recognition, "unrecognized");
  assert.equal(l!.amount_paid, 10);
});

test("a payment record on ANOTHER order never makes a Reserved order Sold (payments are matched by order_id)", async () => {
  const lines = await getSoldLines(SEPT, client(withReservedEdgeCases()), null);
  // O4's payments (50) and R3's payment (10) exist; R1/R2 have none of their own.
  assert.equal(lines.some((l) => l.order_id === "R1" || l.order_id === "R2"), false);
  assert.equal(lines.find((l) => l.line_key === "I4")!.amount_paid, 50, "O4 keeps only its own payment");
});

test("Reserved-unpaid (no payment record), Draft and Lost stay out; Completed with no payment record at all is still Sold (unrecognized)", async () => {
  const data = withReservedEdgeCases();
  data.orders.push({ ...data.orders.find((o) => o.id === "O3")!, id: "C9", order_number: "ORD-C9", payment_status: "Unpaid", total_amount: 33 });
  data.orderItems.push({ ...data.orderItems.find((i) => i.id === "I3")!, id: "IC9", order_id: "C9", snapshot_sale_price: 33 });
  const lines = await getSoldLines(SEPT, client(data), null);
  const keys = lines.map((l) => l.line_key);
  for (const excluded of ["I5", "I6", "I7"]) assert.equal(keys.includes(excluded), false, excluded);
  const c9 = lines.find((l) => l.line_key === "IC9")!;
  assert.equal(c9.recognition, "unrecognized");
  assert.equal(c9.amount_paid, 0);
});
