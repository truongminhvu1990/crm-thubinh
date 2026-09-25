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
