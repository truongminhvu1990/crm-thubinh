import test from "node:test";
import assert from "node:assert/strict";
import { mergeReconciliation, ReconciliationTopCustomerInput } from "./reportsReconciliation.merge";

function customer(id: string, revenue: number, name = id): ReconciliationTopCustomerInput {
  return { customerId: id, customerName: name, customerCode: id, revenue };
}

test("mergeReconciliation: equal revenue on both sides -> Reconciled, delta 0", () => {
  const result = mergeReconciliation(100_000_000, 100_000_000, [], []);
  assert.equal(result.revenue.status, "Reconciled");
  assert.equal(result.revenue.delta, 0);
});

test("mergeReconciliation: any non-zero delta -> Discrepancy Found (§10 field 11's own definition)", () => {
  const result = mergeReconciliation(100_000_000, 90_000_000, [], []);
  assert.equal(result.revenue.status, "Discrepancy Found");
  assert.equal(result.revenue.delta, 10_000_000);
});

test("mergeReconciliation: deltaPercent is null when biRevenue is 0 (undefined percentage, not divide-by-zero)", () => {
  const result = mergeReconciliation(5_000_000, 0, [], []);
  assert.equal(result.revenue.deltaPercent, null);
});

test("mergeReconciliation: deltaPercent computed relative to biRevenue", () => {
  const result = mergeReconciliation(110_000_000, 100_000_000, [], []);
  assert.equal(result.revenue.deltaPercent, 10);
});

test("mergeReconciliation: a customer present on both sides gets both values and a real delta", () => {
  const result = mergeReconciliation(0, 0, [customer("c1", 5_000_000)], [customer("c1", 4_000_000)]);
  assert.equal(result.topCustomers.length, 1);
  assert.equal(result.topCustomers[0].reportsRevenue, 5_000_000);
  assert.equal(result.topCustomers[0].biRevenue, 4_000_000);
  assert.equal(result.topCustomers[0].delta, 1_000_000);
});

test("mergeReconciliation: a customer present only in Reports gets null on the BI side, delta = full amount", () => {
  const result = mergeReconciliation(0, 0, [customer("only-reports", 3_000_000)], []);
  assert.equal(result.topCustomers[0].reportsRevenue, 3_000_000);
  assert.equal(result.topCustomers[0].biRevenue, null);
  assert.equal(result.topCustomers[0].delta, 3_000_000);
});

test("mergeReconciliation: a customer present only in BI gets null on the Reports side, delta = -full amount", () => {
  const result = mergeReconciliation(0, 0, [], [customer("only-bi", 2_000_000)]);
  assert.equal(result.topCustomers[0].reportsRevenue, null);
  assert.equal(result.topCustomers[0].biRevenue, 2_000_000);
  assert.equal(result.topCustomers[0].delta, -2_000_000);
});

test("mergeReconciliation: sorted by the larger of the two revenue values, descending (§10 field 10)", () => {
  const result = mergeReconciliation(
    0,
    0,
    [customer("small", 1_000_000), customer("big-reports", 9_000_000)],
    [customer("big-bi", 8_000_000)]
  );
  assert.deepEqual(
    result.topCustomers.map((c) => c.customerId),
    ["big-reports", "big-bi", "small"]
  );
});

test("mergeReconciliation: no customers on either side -> empty list, not an error", () => {
  const result = mergeReconciliation(0, 0, [], []);
  assert.deepEqual(result.topCustomers, []);
});
