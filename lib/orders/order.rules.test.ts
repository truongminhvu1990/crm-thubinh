import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRemainingBalance,
  deriveFinancialSettlementState,
  calculateOverpaidAmount,
  canAddPayment,
} from "./order.rules";
import { OrderStatus } from "@/types/order";

/**
 * Finance Project #1, Phase C — Overpayment Surfacing (Product Owner
 * Approval, 2026-08-21). Outstanding = Total − Paid, classified as
 * Outstanding (>0) / Settled (=0) / Overpaid (<0). Warning-only: these are
 * pure display-classification functions over the existing, unclamped
 * calculateRemainingBalance() — they never cap, block, or refund a payment.
 */

test("deriveFinancialSettlementState: positive remaining balance is Outstanding", () => {
  assert.equal(deriveFinancialSettlementState(500_000), "Outstanding");
});

test("deriveFinancialSettlementState: zero remaining balance is Settled", () => {
  assert.equal(deriveFinancialSettlementState(0), "Settled");
});

test("deriveFinancialSettlementState: negative remaining balance is Overpaid", () => {
  assert.equal(deriveFinancialSettlementState(-200_000), "Overpaid");
});

test("calculateOverpaidAmount: Outstanding (positive remaining) yields 0, never a negative 'overpaid'", () => {
  assert.equal(calculateOverpaidAmount(500_000), 0);
});

test("calculateOverpaidAmount: Settled (zero remaining) yields 0", () => {
  assert.equal(calculateOverpaidAmount(0), 0);
});

test("calculateOverpaidAmount: Overpaid — returns the correct positive amount, the absolute value of the negative remaining balance", () => {
  assert.equal(calculateOverpaidAmount(-200_000), 200_000);
});

test("end-to-end via calculateRemainingBalance: mixed payment data across three orders — Outstanding, Settled, and Overpaid are each classified correctly with the right amounts", () => {
  const outstandingOrder = calculateRemainingBalance(1_000_000, [{ amount: 400_000 }]);
  const settledOrder = calculateRemainingBalance(1_000_000, [{ amount: 600_000 }, { amount: 400_000 }]);
  const overpaidOrder = calculateRemainingBalance(1_000_000, [{ amount: 700_000 }, { amount: 500_000 }]);

  assert.equal(outstandingOrder, 600_000);
  assert.equal(deriveFinancialSettlementState(outstandingOrder), "Outstanding");
  assert.equal(calculateOverpaidAmount(outstandingOrder), 0);

  assert.equal(settledOrder, 0);
  assert.equal(deriveFinancialSettlementState(settledOrder), "Settled");
  assert.equal(calculateOverpaidAmount(settledOrder), 0);

  assert.equal(overpaidOrder, -200_000);
  assert.equal(deriveFinancialSettlementState(overpaidOrder), "Overpaid");
  assert.equal(calculateOverpaidAmount(overpaidOrder), 200_000, "the customer overpaid by exactly 200,000, not 1,200,000 or any other figure");
});

test("calculateRemainingBalance itself is never clamped — a negative result (overpayment) flows through unchanged, which is what makes Phase C's classification possible", () => {
  const remaining = calculateRemainingBalance(500_000, [{ amount: 900_000 }]);
  assert.equal(remaining, -400_000);
});

/**
 * canAddPayment (Finance Project #1, Product Owner Authorization,
 * 2026-08-22) — Paid must reject a further payment on every open order
 * status (Draft/Reserved), not just Completed. Overpaid has no distinct
 * PaymentStatus of its own (derivePaymentStatus maps sum >= total to
 * "Paid" regardless of how far over), so "Paid" already covers it.
 */
const OPEN_AND_COMPLETED_STATUSES: OrderStatus[] = ["Draft", "Reserved", "Completed"];

test("canAddPayment: Lost always rejects, regardless of payment status", () => {
  assert.equal(canAddPayment("Lost", "Unpaid"), false);
  assert.equal(canAddPayment("Lost", "Partially Paid"), false);
  assert.equal(canAddPayment("Lost", "Paid"), false);
});

for (const status of OPEN_AND_COMPLETED_STATUSES) {
  test(`canAddPayment: ${status} + Paid rejects a further payment (covers Overpaid too, stored as Paid)`, () => {
    assert.equal(canAddPayment(status, "Paid"), false);
  });

  test(`canAddPayment: ${status} + Unpaid allows a payment`, () => {
    assert.equal(canAddPayment(status, "Unpaid"), true);
  });

  test(`canAddPayment: ${status} + Partially Paid allows a payment`, () => {
    assert.equal(canAddPayment(status, "Partially Paid"), true);
  });
}
