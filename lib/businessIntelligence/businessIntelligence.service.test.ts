import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// businessIntelligence.service.ts imports "@/lib/supabase" (a real client,
// throws without env vars) only as the default parameter value - every
// call below injects its own fake client instead, same dependency
// injection pattern already used throughout this codebase's own
// `client: SupabaseClient = supabase` functions.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakeProductRow {
  id: string;
  status: string;
  sale_price: number;
}

/** Minimal fake covering exactly the one call getInventoryAnalytics makes
 * (`client.from("products").select("id, status, sale_price")`), resolved
 * directly since Supabase's own query builder is thenable and this
 * function `await`s the `.select(...)` call with no further chaining. */
function fakeClient(products: FakeProductRow[]) {
  return {
    from: (table: string) => {
      assert.equal(table, "products");
      return {
        select: async () => ({ data: products, error: null }),
      };
    },
  } as never;
}

function product(id: string, status: string, sale_price = 1_000_000): FakeProductRow {
  return { id, status, sale_price };
}

test("getInventoryAnalytics: Product Status Standardization - Sold products counted correctly, not conflated with Available/Reserved", async () => {
  const { getInventoryAnalytics } = await import("./businessIntelligence.service");

  const client = fakeClient([
    product("p1", "Available"),
    product("p2", "Available"),
    product("p3", "Reserved"),
    product("p4", "Sold"),
    product("p5", "Sold"),
    product("p6", "Sold"),
    product("p7", "Archived"),
  ]);

  const result = await getInventoryAnalytics(client);

  assert.equal(result.productsSold, 3, "3 Sold rows must count as exactly 3, unaffected by other statuses");
  assert.equal(result.productsAvailable, 2, "Products Available = COUNT WHERE status = 'Available' only, per docs/18_BUSINESS_INTELLIGENCE_SPEC.md");
  assert.equal(result.productsReserved, 1, "Products Reserved = COUNT WHERE status = 'Reserved', read directly (no order_items join needed now)");
});

test("getInventoryAnalytics: Inventory Value sums Available + Reserved, excludes Sold and Archived", async () => {
  const { getInventoryAnalytics } = await import("./businessIntelligence.service");

  const client = fakeClient([
    product("p1", "Available", 5_000_000),
    product("p2", "Reserved", 3_000_000),
    product("p3", "Sold", 10_000_000),
    product("p4", "Archived", 2_000_000),
  ]);

  const result = await getInventoryAnalytics(client);

  assert.equal(result.inventoryValue, 8_000_000, "Decision 1: SUM(Base Price) WHERE status IN (Available, Reserved) only");
});

test("getInventoryAnalytics: empty inventory produces all-zero result, not an error", async () => {
  const { getInventoryAnalytics } = await import("./businessIntelligence.service");

  const result = await getInventoryAnalytics(fakeClient([]));

  assert.deepEqual(result, { inventoryValue: 0, productsAvailable: 0, productsReserved: 0, productsSold: 0 });
});

// ============================================================
// getFinancialAnalytics — Outstanding Compensation (Finance Project #1,
// Phase A Semantic Fix, Product Owner directive 2026-08-21).
//
// getFinancialAnalytics makes several concurrent, chained Supabase queries
// (settlements twice — once inside fetchCompletedSettlementItems filtered
// to Completed, once directly for settlementStatus — plus settlement_items,
// compensations, compensation_ledger_entries). Real Postgres does the
// actual row filtering (.not(), .eq(), .in(), .gte()/.lt() via applyRange);
// this fake, like every other perTableSequence fake in this codebase
// (settlement.service.test.ts, compensation.service.test.ts), does not
// re-implement that filtering — it records every chained call and returns
// pre-configured, already-filtered fixture data per call, one queue entry
// consumed per successive call to the same table. Each test below
// therefore proves two things together: (1) the compensations query is
// actually built with the correct status filter (asserted via the recorded
// call args), and (2) outstandingCompensation correctly sums whatever rows
// that filtered query returns, with no separate/duplicate aggregation bug.
// ============================================================

interface FakeResult {
  data: unknown;
  error?: unknown;
}

interface RecordedCall {
  table: string;
  callIndex: number;
  method: string;
  args: unknown[];
}

function makeFinancialClient(perTableSequence: Record<string, FakeResult[]>) {
  const counters: Record<string, number> = {};
  const calls: RecordedCall[] = [];

  return {
    calls,
    client: {
      from(table: string) {
        const seq = perTableSequence[table];
        if (!seq) throw new Error(`Unexpected table in test fake: ${table}`);
        const idx = counters[table] ?? 0;
        counters[table] = idx + 1;
        const result = seq[idx] ?? seq[seq.length - 1];

        const handler: ProxyHandler<object> = {
          get(_target, prop) {
            const resolved = Promise.resolve({ error: null, ...result });
            if (prop === "then") return resolved.then.bind(resolved);
            if (prop === "catch") return resolved.catch.bind(resolved);
            return (...args: unknown[]) => {
              calls.push({ table, callIndex: idx, method: String(prop), args });
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

function outstandingFixture(perTableSequence: Record<string, FakeResult[]> = {}) {
  return {
    // fetchCompletedSettlementItems' own settlements call (Completed-only)
    // and getFinancialAnalytics' own direct settlements call
    // (settlementStatus) both hit "settlements" — two queue entries, both
    // empty (irrelevant to Outstanding Compensation).
    settlements: [{ data: [] }, { data: [] }],
    settlement_items: [{ data: [] }],
    compensation_ledger_entries: [{ data: [] }],
    ...perTableSequence,
  };
}

test("getFinancialAnalytics: Outstanding Compensation query excludes both Handed Off and Paid (Phase A Semantic Fix)", async () => {
  const { getFinancialAnalytics } = await import("./businessIntelligence.service");
  const { client, calls } = makeFinancialClient(outstandingFixture({ compensations: [{ data: [] }] }));

  await getFinancialAnalytics(null, client);

  const filterCall = calls.find((c) => c.table === "compensations" && c.method === "not");
  assert.ok(filterCall, "expected a .not() call filtering the compensations query");
  assert.deepEqual(filterCall!.args, ["status", "in", '("Handed Off","Paid")']);
});

test("getFinancialAnalytics: Pending compensation is included in Outstanding", async () => {
  const { getFinancialAnalytics } = await import("./businessIntelligence.service");
  const { client } = makeFinancialClient(
    outstandingFixture({ compensations: [{ data: [{ calculated_amount: 500000 }] }] })
  );

  const result = await getFinancialAnalytics(null, client);
  assert.equal(result.outstandingCompensation, 500000);
});

test("getFinancialAnalytics: Handed Off compensation is excluded from Outstanding (already filtered out by the query, never reaches the sum)", async () => {
  const { getFinancialAnalytics } = await import("./businessIntelligence.service");
  // The row never appears in this fixture's compensations data at all —
  // exactly what a real .not('status','in',...) filter would produce for a
  // Handed Off row, matching this codebase's own fake-client convention of
  // supplying already-filtered fixture data (see this block's own header
  // comment).
  const { client } = makeFinancialClient(outstandingFixture({ compensations: [{ data: [] }] }));

  const result = await getFinancialAnalytics(null, client);
  assert.equal(result.outstandingCompensation, 0);
});

test("getFinancialAnalytics: Paid compensation is excluded from Outstanding — the exact regression Phase A introduced and this fix closes", async () => {
  const { getFinancialAnalytics } = await import("./businessIntelligence.service");
  // Same reasoning as the Handed Off case: a real Paid row would be
  // filtered out by .not('status','in','(...,"Paid")') before ever
  // reaching this fixture.
  const { client } = makeFinancialClient(outstandingFixture({ compensations: [{ data: [] }] }));

  const result = await getFinancialAnalytics(null, client);
  assert.equal(result.outstandingCompensation, 0, "a Paid compensation must not inflate Outstanding Compensation");
});

test("getFinancialAnalytics: mixed statuses — only genuinely outstanding (Draft/Pending/Confirmed/Cancelled) amounts are summed", async () => {
  const { getFinancialAnalytics } = await import("./businessIntelligence.service");
  // Fixture represents what the DB returns AFTER filtering — i.e. every row
  // that would survive .not('status','in',('Handed Off','Paid')). Handed
  // Off/Paid rows are never in this list, matching the query's own
  // contract; this test proves the sum over a realistic mixed result set
  // is exactly right, not just correct for a single-row case.
  const { client } = makeFinancialClient(
    outstandingFixture({
      compensations: [
        {
          data: [
            { calculated_amount: 100000 }, // Draft
            { calculated_amount: 200000 }, // Pending
            { calculated_amount: 300000 }, // Confirmed
            { calculated_amount: 50000 }, // Cancelled — Decision 6 does not exclude it either
          ],
        },
      ],
    })
  );

  const result = await getFinancialAnalytics(null, client);
  assert.equal(result.outstandingCompensation, 650000);
});
