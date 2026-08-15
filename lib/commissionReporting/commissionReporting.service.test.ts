import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { RawCommissionRow } from "./commissionReporting.service";

// paymentMethodReport.service.test.ts's own precedent: this module has no
// transitive Supabase import itself, but mocked here anyway for parity and
// in case that changes - every test below drives pure logic with plain
// arrays (no I/O).
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

function commission(
  overrides: Partial<RawCommissionRow> & Pick<RawCommissionRow, "id" | "sale_amount" | "commission_amount">
): RawCommissionRow {
  return {
    salesperson: "Nguyễn Văn A",
    salesperson_id: "staff-1",
    status: "Pending",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

test("aggregateCommissionBySalesperson: sums sale/commission amounts and counts deals per salesperson", async () => {
  const { aggregateCommissionBySalesperson } = await import("./commissionReporting.service");

  const rows = [
    commission({ id: "c1", sale_amount: 10_000_000, commission_amount: 500_000, salesperson_id: "s1", salesperson: "A" }),
    commission({ id: "c2", sale_amount: 20_000_000, commission_amount: 600_000, salesperson_id: "s1", salesperson: "A" }),
    commission({ id: "c3", sale_amount: 5_000_000, commission_amount: 250_000, salesperson_id: "s2", salesperson: "B" }),
  ];
  const result = aggregateCommissionBySalesperson(rows);

  assert.equal(result.length, 2);
  const a = result.find((r) => r.salespersonId === "s1")!;
  assert.equal(a.dealCount, 2);
  assert.equal(a.totalSaleAmount, 30_000_000);
  assert.equal(a.totalCommissionAmount, 1_100_000);
  assert.equal(a.averageCommissionAmount, 550_000);
});

test("aggregateCommissionBySalesperson: falls back to the salesperson text field when salesperson_id is null (historical rows)", async () => {
  const { aggregateCommissionBySalesperson } = await import("./commissionReporting.service");

  const rows = [
    commission({ id: "c1", sale_amount: 1_000_000, commission_amount: 50_000, salesperson_id: null, salesperson: "Legacy Name" }),
    commission({ id: "c2", sale_amount: 2_000_000, commission_amount: 100_000, salesperson_id: null, salesperson: "Legacy Name" }),
  ];
  const result = aggregateCommissionBySalesperson(rows);

  assert.equal(result.length, 1);
  assert.equal(result[0].salespersonId, null);
  assert.equal(result[0].salespersonName, "Legacy Name");
  assert.equal(result[0].dealCount, 2);
});

test("aggregateCommissionBySalesperson: empty input produces an empty result (empty state)", async () => {
  const { aggregateCommissionBySalesperson } = await import("./commissionReporting.service");
  assert.deepEqual(aggregateCommissionBySalesperson([]), []);
});

test("computeCommissionAging: days pending is floor((now - created_at) / 1 day)", async () => {
  const { computeCommissionAging } = await import("./commissionReporting.service");

  const now = new Date("2026-08-14T00:00:00Z").getTime();
  const rows = [commission({ id: "c1", sale_amount: 1_000_000, commission_amount: 50_000, created_at: "2026-08-04T00:00:00Z" })];
  const result = computeCommissionAging(rows, now);

  assert.equal(result[0].daysPending, 10);
});

test("computeCommissionAging: sorts oldest (most days pending) first", async () => {
  const { computeCommissionAging } = await import("./commissionReporting.service");

  const now = new Date("2026-08-14T00:00:00Z").getTime();
  const rows = [
    commission({ id: "recent", sale_amount: 1_000_000, commission_amount: 50_000, created_at: "2026-08-12T00:00:00Z" }),
    commission({ id: "oldest", sale_amount: 1_000_000, commission_amount: 50_000, created_at: "2026-07-01T00:00:00Z" }),
    commission({ id: "middle", sale_amount: 1_000_000, commission_amount: 50_000, created_at: "2026-08-01T00:00:00Z" }),
  ];
  const result = computeCommissionAging(rows, now);

  assert.deepEqual(result.map((r) => r.id), ["oldest", "middle", "recent"]);
});

test("computeCommissionAging: a commission created this same instant has 0 days pending, not negative or NaN", async () => {
  const { computeCommissionAging } = await import("./commissionReporting.service");

  const now = new Date("2026-08-14T00:00:00Z").getTime();
  const rows = [commission({ id: "c1", sale_amount: 1_000_000, commission_amount: 50_000, created_at: "2026-08-14T00:00:00Z" })];
  const result = computeCommissionAging(rows, now);

  assert.equal(result[0].daysPending, 0);
});
