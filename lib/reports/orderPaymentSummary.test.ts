import test from "node:test";
import assert from "node:assert/strict";
import { deriveOrderPaymentSummary } from "./orderPaymentSummary";

test("deriveOrderPaymentSummary: no payments — amountPaid 0, remainingBalance = totalAmount, paymentMethods null", () => {
  const result = deriveOrderPaymentSummary(10_000_000, []);
  assert.equal(result.amountPaid, 0);
  assert.equal(result.remainingBalance, 10_000_000);
  assert.equal(result.paymentMethods, null);
});

test("deriveOrderPaymentSummary: single payment — amountPaid/remainingBalance/paymentMethods all reflect it", () => {
  const result = deriveOrderPaymentSummary(10_000_000, [{ amount: 6_000_000, payment_method: "Tiền mặt" }]);
  assert.equal(result.amountPaid, 6_000_000);
  assert.equal(result.remainingBalance, 4_000_000);
  assert.equal(result.paymentMethods, "Tiền mặt");
});

test("deriveOrderPaymentSummary: fully paid — remainingBalance is 0, not negative", () => {
  const result = deriveOrderPaymentSummary(5_000_000, [{ amount: 5_000_000, payment_method: "Tiền mặt" }]);
  assert.equal(result.remainingBalance, 0);
});

test("deriveOrderPaymentSummary: multiple payments, same method — amounts sum, method listed once", () => {
  const result = deriveOrderPaymentSummary(10_000_000, [
    { amount: 5_000_000, payment_method: "Tiền mặt" },
    { amount: 5_000_000, payment_method: "Tiền mặt" },
  ]);
  assert.equal(result.amountPaid, 10_000_000);
  assert.equal(result.remainingBalance, 0);
  assert.equal(result.paymentMethods, "Tiền mặt");
});

test("deriveOrderPaymentSummary: multiple payments, different methods — both listed, comma-joined, never silently picking one", () => {
  const result = deriveOrderPaymentSummary(10_000_000, [
    { amount: 6_000_000, payment_method: "Tiền mặt" },
    { amount: 4_000_000, payment_method: "Chuyển khoản" },
  ]);
  assert.equal(result.amountPaid, 10_000_000);
  assert.equal(result.remainingBalance, 0);
  assert.equal(result.paymentMethods, "Chuyển khoản, Tiền mặt");
});

test("deriveOrderPaymentSummary: Finance Project #1, Phase C (Product Owner Approval, 2026-08-21) — overpaid Order's remainingBalance is negative, not clamped to 0", () => {
  const result = deriveOrderPaymentSummary(5_000_000, [{ amount: 5_800_000, payment_method: "Tiền mặt" }]);
  assert.equal(result.amountPaid, 5_800_000);
  assert.equal(result.remainingBalance, -800_000, "an overpayment must flow through this shared report read-model unclamped, so it can be correctly surfaced downstream");
});
