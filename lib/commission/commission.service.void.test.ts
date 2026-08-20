import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { SalesCommission } from "@/types/commission";

/**
 * Compensation/Commission Void (Product Owner Authorization, 2026-08-20) —
 * Case 5, 6, 13: approveCommission/markCommissionPaid must reject on a
 * Cancelled Order (fail-closed on any unresolved/orphan lookup too), but
 * must NOT gate a commission with no Order link at all (legacy/manual
 * row - see resolveOrderStatusForCommission's own doc comment for why).
 *
 * Mocks lib/commission/commission.repository.ts wholesale (the module
 * commission.service.ts calls via `import * as repo from "./commission.
 * repository"`), same DI-via-module-mock approach order.service.test.ts
 * already uses for its own dependencies. mock.module() called once at
 * file scope, mutable state per test.
 */
// commission.service.ts transitively imports @/lib/customer.service (for
// getCustomers), which imports @/lib/supabase at module level - same fix
// as every other test file in this codebase (e.g. order.service.test.ts).
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

type Lookup =
  | { kind: "no_order_link" }
  | { kind: "orphan" }
  | { kind: "resolved"; orderStatus: string };

let lookupResult: Lookup = { kind: "resolved", orderStatus: "Completed" };
let updateCalls: { id: string; fields: Record<string, unknown> }[] = [];
let getAllCommissionsResult: SalesCommission[] = [];

mock.module("@/lib/commission/commission.repository", {
  namedExports: {
    resolveOrderStatusForCommission: async () => lookupResult,
    updateCommissionStatusFields: async (id: string, fields: Record<string, unknown>) => {
      updateCalls.push({ id, fields });
      return { data: { id, ...fields } as unknown as SalesCommission, error: null };
    },
    getAllCommissions: async () => getAllCommissionsResult,
  },
});

test.beforeEach(() => {
  lookupResult = { kind: "resolved", orderStatus: "Completed" };
  updateCalls = [];
  getAllCommissionsResult = [];
});

function makeCommission(overrides: Partial<SalesCommission> = {}): SalesCommission {
  return {
    id: "comm-1",
    purchase_id: "purchase-1",
    customer_id: "customer-1",
    salesperson: null,
    salesperson_id: null,
    sale_amount: 1000000,
    commission_percent: 5,
    commission_amount: 50000,
    status: "Pending",
    paid_at: null,
    paid_by: null,
    note: null,
    created_at: "2026-08-01",
    ...overrides,
  };
}

test("approveCommission: succeeds normally when the Order is not Cancelled", async () => {
  lookupResult = { kind: "resolved", orderStatus: "Completed" };
  const { approveCommission } = await import("./commission.service");
  const { data, error } = await approveCommission(makeCommission({ status: "Pending" }));
  assert.equal(error, null);
  assert.ok(data);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].fields.status, "Approved");
});

test("Case 5: approveCommission rejects when the Order is Cancelled", async () => {
  lookupResult = { kind: "resolved", orderStatus: "Cancelled" };
  const { approveCommission } = await import("./commission.service");
  const { data, error } = await approveCommission(makeCommission({ status: "Pending" }));
  assert.equal(data, null);
  assert.ok(error);
  assert.equal(updateCalls.length, 0);
});

test("Case 6: markCommissionPaid rejects when the Order is Cancelled", async () => {
  lookupResult = { kind: "resolved", orderStatus: "Cancelled" };
  const { markCommissionPaid } = await import("./commission.service");
  const { data, error } = await markCommissionPaid(makeCommission({ status: "Approved" }), "staff-1");
  assert.equal(data, null);
  assert.ok(error);
  assert.equal(updateCalls.length, 0);
});

test("Case 13: fail-closed — an orphan Order lookup rejects approve, never fail-open", async () => {
  lookupResult = { kind: "orphan" };
  const { approveCommission } = await import("./commission.service");
  const { data, error } = await approveCommission(makeCommission({ status: "Pending" }));
  assert.equal(data, null);
  assert.ok(error);
  assert.equal(updateCalls.length, 0);
});

test("Case 13: fail-closed — an orphan Order lookup rejects markCommissionPaid too", async () => {
  lookupResult = { kind: "orphan" };
  const { markCommissionPaid } = await import("./commission.service");
  const { data, error } = await markCommissionPaid(makeCommission({ status: "Approved" }), "staff-1");
  assert.equal(data, null);
  assert.ok(error);
  assert.equal(updateCalls.length, 0);
});

test("a commission with no Order link at all (legacy/manual row) is NOT gated - approves normally", async () => {
  lookupResult = { kind: "no_order_link" };
  const { approveCommission } = await import("./commission.service");
  const { data, error } = await approveCommission(makeCommission({ status: "Pending" }));
  assert.equal(error, null);
  assert.ok(data);
  assert.equal(updateCalls.length, 1);
});

test("Commission Report: getDashboardCommissionStats' outstanding excludes Void", async () => {
  getAllCommissionsResult = [
    makeCommission({ id: "c1", status: "Pending", commission_amount: 100000, created_at: "2020-01-01" }),
    makeCommission({ id: "c2", status: "Approved", commission_amount: 200000, created_at: "2020-01-01" }),
    makeCommission({ id: "c3", status: "Paid", commission_amount: 300000, created_at: "2020-01-01" }),
    makeCommission({ id: "c4", status: "Void", commission_amount: 999999, created_at: "2020-01-01" }),
  ];
  const { getDashboardCommissionStats } = await import("./commission.service");
  const stats = await getDashboardCommissionStats();
  assert.equal(stats.outstanding, 300000, "Pending(100k) + Approved(200k) only - Paid and Void excluded");
});
