import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// commissionExpense.ts imports "@/lib/supabase" (a real client, throws
// without env vars) only as the default parameter value - every call below
// injects its own fake client instead, same dependency injection pattern
// already used throughout this codebase's own `client: SupabaseClient =
// supabase` functions.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

/**
 * Accrual Commission Expense (Finance Project #1, Phase D, Product Owner
 * Approval 2026-08-21) — Net Profit = Revenue − Discount − COGS −
 * Partner Compensation − Staff Commission − Operating Expenses, accrual
 * basis. Covers the Product Owner's own required test list: partner-only,
 * staff-only, both, zero, unpaid-still-deducted, paid-not-double-counted
 * (for both sources), and mixed paid/unpaid.
 */

interface FakeResult {
  data: unknown;
  error?: unknown;
}

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function makeClient(perTable: Record<string, FakeResult>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const result = perTable[table];
        if (!result) throw new Error(`Unexpected table in test fake: ${table}`);
        const handler: ProxyHandler<object> = {
          get(_target, prop) {
            const resolved = Promise.resolve({ error: null, ...result });
            if (prop === "then") return resolved.then.bind(resolved);
            if (prop === "catch") return resolved.catch.bind(resolved);
            return (...args: unknown[]) => {
              calls.push({ table, method: String(prop), args });
              return proxy;
            };
          },
        };
        const proxy: unknown = new Proxy({}, handler);
        return proxy;
      },
    } as never,
  };
}

test("getAccrualCommissionExpense: Partner Compensation only — Staff Commission is 0 when no sales_commissions rows exist", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    compensations: { data: [{ calculated_amount: 300_000 }] },
    sales_commissions: { data: [] },
  });

  const result = await getAccrualCommissionExpense({ orderIds: ["order-1"], purchaseIds: [] }, client);

  assert.equal(result.partnerCompensation, 300_000);
  assert.equal(result.staffCommission, 0);
});

test("getAccrualCommissionExpense: Staff Commission only — Partner Compensation is 0 when no compensations rows exist", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    compensations: { data: [] },
    sales_commissions: { data: [{ commission_amount: 150_000 }] },
  });

  const result = await getAccrualCommissionExpense({ orderIds: [], purchaseIds: ["purchase-1"] }, client);

  assert.equal(result.partnerCompensation, 0);
  assert.equal(result.staffCommission, 150_000);
});

test("getAccrualCommissionExpense: both simultaneously — each source sums independently, no cross-contamination", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    compensations: { data: [{ calculated_amount: 300_000 }, { calculated_amount: 200_000 }] },
    sales_commissions: { data: [{ commission_amount: 150_000 }, { commission_amount: 50_000 }] },
  });

  const result = await getAccrualCommissionExpense({ orderIds: ["order-1", "order-2"], purchaseIds: ["purchase-1", "purchase-2"] }, client);

  assert.equal(result.partnerCompensation, 500_000);
  assert.equal(result.staffCommission, 200_000);
});

test("getAccrualCommissionExpense: zero commission — empty scope never queries either table, both sources return 0", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client, calls } = makeClient({ compensations: { data: [] }, sales_commissions: { data: [] } });

  const result = await getAccrualCommissionExpense({ orderIds: [], purchaseIds: [] }, client);

  assert.equal(result.partnerCompensation, 0);
  assert.equal(result.staffCommission, 0);
  assert.equal(calls.length, 0, "no DB call should happen at all for an empty scope");
});

test("getAccrualCommissionExpense: Partner Compensation query is scoped to Confirmed/Handed Off/Paid — Draft/Pending are never requested (provisional, voidable pre-Confirm)", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client, calls } = makeClient({
    compensations: { data: [{ calculated_amount: 100_000 }] },
    sales_commissions: { data: [] },
  });

  await getAccrualCommissionExpense({ orderIds: ["order-1"], purchaseIds: [] }, client);

  const statusFilter = calls.find((c) => c.table === "compensations" && c.method === "in" && c.args[0] === "status");
  assert.deepEqual(statusFilter!.args, ["status", ["Confirmed", "Handed Off", "Paid"]]);
});

test("getAccrualCommissionExpense: an UNPAID (Confirmed) Partner Compensation is still deducted — accrual, not cash basis", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    compensations: { data: [{ calculated_amount: 400_000 }] }, // represents a Confirmed, not-yet-Paid row
    sales_commissions: { data: [] },
  });

  const result = await getAccrualCommissionExpense({ orderIds: ["order-1"], purchaseIds: [] }, client);
  assert.equal(result.partnerCompensation, 400_000);
});

test("getAccrualCommissionExpense: an UNPAID (Pending) Staff Commission is still deducted — accrual, not cash basis", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    compensations: { data: [] },
    sales_commissions: { data: [{ commission_amount: 75_000 }] }, // represents a Pending row
  });

  const result = await getAccrualCommissionExpense({ orderIds: [], purchaseIds: ["purchase-1"] }, client);
  assert.equal(result.staffCommission, 75_000);
});

test("getAccrualCommissionExpense: a Paid Partner Compensation is counted exactly once, never twice — one row, queried once, summed once", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  // A Compensation row that has reached Paid is still exactly one row in
  // `compensations` — Paid is a status UPDATE on the same row, never a
  // second INSERT. The status filter includes 'Paid' alongside
  // Confirmed/Handed Off, so it's returned once, summed once.
  const { client } = makeClient({
    compensations: { data: [{ calculated_amount: 600_000 }] },
    sales_commissions: { data: [] },
  });

  const result = await getAccrualCommissionExpense({ orderIds: ["order-1"], purchaseIds: [] }, client);
  assert.equal(result.partnerCompensation, 600_000, "must equal the single row's amount, not double it");
});

test("getAccrualCommissionExpense: a Paid Staff Commission is counted exactly once, never twice — one row, queried once, summed once", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    compensations: { data: [] },
    sales_commissions: { data: [{ commission_amount: 250_000 }] },
  });

  const result = await getAccrualCommissionExpense({ orderIds: [], purchaseIds: ["purchase-1"] }, client);
  assert.equal(result.staffCommission, 250_000, "must equal the single row's amount, not double it");
});

test("getAccrualCommissionExpense: Staff Commission scoped to Pending/Approved/Paid — Void is never requested (Finding 1, Order Cancellation)", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client, calls } = makeClient({
    compensations: { data: [] },
    sales_commissions: { data: [{ commission_amount: 90_000 }] },
  });

  await getAccrualCommissionExpense({ orderIds: [], purchaseIds: ["purchase-1"] }, client);

  const statusFilter = calls.find((c) => c.table === "sales_commissions" && c.method === "in" && c.args[0] === "status");
  assert.deepEqual(statusFilter!.args, ["status", ["Pending", "Approved", "Paid"]]);
});

test("getAccrualCommissionExpense: a Void Staff Commission is excluded from Net Profit expense (Finding 1 — an Order Cancellation voided commission is no longer a real expense)", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  // The fake client's status filter is not itself evaluated against the
  // data (makeClient just records the call and returns whatever `data` is
  // configured) — this test instead asserts the query is actually scoped
  // to exclude Void, the same way the Partner Compensation status-filter
  // test above does, and pairs with the "mixed statuses" test below for
  // the query-application-level behavior.
  const { client, calls } = makeClient({
    compensations: { data: [] },
    sales_commissions: { data: [] }, // a real DB with the .in() filter applied would never return the Void row here
  });

  const result = await getAccrualCommissionExpense({ orderIds: [], purchaseIds: ["purchase-void"] }, client);

  const statusFilter = calls.find((c) => c.table === "sales_commissions" && c.method === "in" && c.args[0] === "status");
  assert.ok(!(statusFilter!.args[1] as string[]).includes("Void"), "Void must not be in the requested status set");
  assert.equal(result.staffCommission, 0);
});

test("getAccrualCommissionExpense: mixed Pending/Approved/Paid Staff Commission rows sum correctly (Void rows are filtered at the query level, never reach this sum)", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    compensations: { data: [] },
    // Represents what the DB returns once .in(status, [Pending,Approved,Paid])
    // has already excluded any Void row — a Pending + an Approved + a Paid row.
    sales_commissions: {
      data: [{ commission_amount: 10_000 }, { commission_amount: 20_000 }, { commission_amount: 30_000 }],
    },
  });

  const result = await getAccrualCommissionExpense({ orderIds: [], purchaseIds: ["p-1", "p-2", "p-3"] }, client);

  assert.equal(result.staffCommission, 60_000, "Pending + Approved + Paid must sum correctly regardless of order");
});

test("getAccrualCommissionExpense: existing purchase_id scoping is unchanged by the Void exclusion", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client, calls } = makeClient({
    compensations: { data: [] },
    sales_commissions: { data: [{ commission_amount: 50_000 }] },
  });

  await getAccrualCommissionExpense({ orderIds: [], purchaseIds: ["purchase-1", "purchase-2"] }, client);

  const purchaseFilter = calls.find((c) => c.table === "sales_commissions" && c.method === "in" && c.args[0] === "purchase_id");
  assert.deepEqual(purchaseFilter!.args, ["purchase_id", ["purchase-1", "purchase-2"]]);
});

test("getAccrualCommissionExpense: mixed paid/unpaid across both sources sums correctly — no status combination causes over- or under-counting", async () => {
  const { getAccrualCommissionExpense } = await import("./commissionExpense");
  const { client } = makeClient({
    // Confirmed (unpaid) + Handed Off (unpaid) + Paid — three distinct rows,
    // three distinct compensations, summed once each.
    compensations: {
      data: [{ calculated_amount: 100_000 }, { calculated_amount: 200_000 }, { calculated_amount: 300_000 }],
    },
    // Pending (unpaid) + Approved (unpaid) + Paid — same shape for the
    // separate Staff Commission system.
    sales_commissions: {
      data: [{ commission_amount: 10_000 }, { commission_amount: 20_000 }, { commission_amount: 30_000 }],
    },
  });

  const result = await getAccrualCommissionExpense(
    { orderIds: ["order-1", "order-2", "order-3"], purchaseIds: ["purchase-1", "purchase-2", "purchase-3"] },
    client
  );

  assert.equal(result.partnerCompensation, 600_000);
  assert.equal(result.staffCommission, 60_000);
});
