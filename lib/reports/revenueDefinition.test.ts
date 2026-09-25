import test from "node:test";
import assert from "node:assert/strict";
import { isOrderRecognized, isSoldOrder, isLostOrder, summarizeRevenue } from "./revenueDefinition";

const o = (order_status: string, payment_status: string) => ({ order_status, payment_status });

test("isOrderRecognized: BR-001 — only Completed + Paid; Completed alone never recognizes", () => {
  assert.equal(isOrderRecognized(o("Completed", "Paid")), true);
  assert.equal(isOrderRecognized(o("Completed", "PartiallyPaid")), false);
  assert.equal(isOrderRecognized(o("Completed", "Partially Paid")), false);
  assert.equal(isOrderRecognized(o("Completed", "Unpaid")), false);
  assert.equal(isOrderRecognized(o("Reserved", "Paid")), false);
  assert.equal(isOrderRecognized(o("Draft", "Paid")), false);
  assert.equal(isOrderRecognized(o("Lost", "Paid")), false);
});

test("isSoldOrder: Completed (any payment) and Reserved with a deposit are sold; Draft, Reserved-unpaid and Lost are not", () => {
  assert.equal(isSoldOrder(o("Completed", "Paid")), true);
  assert.equal(isSoldOrder(o("Completed", "PartiallyPaid")), true);
  assert.equal(isSoldOrder(o("Completed", "Unpaid")), true, "payment status never removes a Completed order from the sold set");
  assert.equal(isSoldOrder(o("Reserved", "PartiallyPaid")), true);
  assert.equal(isSoldOrder(o("Reserved", "Partially Paid")), true);
  assert.equal(isSoldOrder(o("Reserved", "Paid")), true);
  assert.equal(isSoldOrder(o("Reserved", "Unpaid")), false);
  assert.equal(isSoldOrder(o("Draft", "PartiallyPaid")), false);
  assert.equal(isSoldOrder(o("Draft", "Unpaid")), false);
  assert.equal(isSoldOrder(o("Lost", "Paid")), false);
});

test("isLostOrder", () => {
  assert.equal(isLostOrder(o("Lost", "Unpaid")), true);
  assert.equal(isLostOrder(o("Completed", "Paid")), false);
});

const rows = [
  { ...o("Completed", "Paid"), amount: 100 },
  { ...o("Completed", "PartiallyPaid"), amount: 50 },
  { ...o("Reserved", "PartiallyPaid"), amount: 200 },
  { ...o("Reserved", "Unpaid"), amount: 30 },
  { ...o("Draft", "Unpaid"), amount: 10 },
  { ...o("Lost", "Unpaid"), amount: 500 },
];

test("summarizeRevenue (default = SALES VALUE): Lost excluded, TOTAL = RECOGNIZED + UNRECOGNIZED, counts and ratio agree", () => {
  const r = summarizeRevenue(rows);
  assert.equal(r.total, 390);
  assert.equal(r.recognized, 100);
  assert.equal(r.unrecognized, 290);
  assert.equal(r.total, r.recognized + r.unrecognized);
  assert.equal(r.orderCount, 5);
  assert.equal(r.recognizedOrderCount, 1);
  assert.equal(r.unrecognizedOrderCount, 4);
  assert.equal(r.orderCount, r.recognizedOrderCount + r.unrecognizedOrderCount);
  assert.equal(r.recognizedRatio, 100 / 390);
});

test("summarizeRevenue (sold population): deposits are in the sold total but not in recognized; identity still holds", () => {
  const r = summarizeRevenue(rows, isSoldOrder);
  assert.equal(r.total, 350, "Completed/Paid 100 + Completed/Partial 50 + Reserved/Partial 200");
  assert.equal(r.recognized, 100);
  assert.equal(r.unrecognized, 250);
  assert.equal(r.total, r.recognized + r.unrecognized);
  assert.equal(r.orderCount, 3);
});

test("summarizeRevenue: empty input → zeros, ratio 0 (no division by zero)", () => {
  const r = summarizeRevenue([]);
  assert.deepEqual(r, {
    total: 0,
    recognized: 0,
    unrecognized: 0,
    orderCount: 0,
    recognizedOrderCount: 0,
    unrecognizedOrderCount: 0,
    recognizedRatio: 0,
  });
});
