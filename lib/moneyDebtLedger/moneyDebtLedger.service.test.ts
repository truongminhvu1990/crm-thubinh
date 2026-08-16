import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

/**
 * Money & Debt Ledger (docs/19_MONEY_DEBT_LEDGER_SPEC.md, DRAFT Rev 1) —
 * Product Owner Implementation Authorization, 2026-08-15.
 *
 * Every write here goes through create_money_debt_ledger_entry() /
 * create_buy_cny_ledger_transaction() (SECURITY DEFINER Postgres
 * functions, supabase/migrations/2026081714_money_debt_ledger_module.sql)
 * — DB-level immutability/RLS enforcement itself is not JS and is not
 * re-verified here (verified by static inspection: the migration's own
 * table grants SELECT only, no INSERT/UPDATE/DELETE policy for any role —
 * same pattern already covered for Compensation Ledger). This file covers
 * what IS JS code: balance aggregation, filtering, reconciliation-
 * candidate derivation, and the service's own call shape into both RPCs.
 */

interface FakeResult {
  data: unknown;
  error?: unknown;
}

function makeFromClient(perTableSequence: Record<string, FakeResult[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const cursors: Record<string, number> = {};
  return {
    calls,
    from(table: string) {
      const seq = perTableSequence[table];
      if (!seq) throw new Error(`Unexpected table in test fake: ${table}`);
      const index = cursors[table] ?? 0;
      const result = seq[Math.min(index, seq.length - 1)];

      const handler: ProxyHandler<object> = {
        get(_target, prop) {
          const resolved = Promise.resolve({ error: null, ...result });
          if (prop === "then") {
            cursors[table] = index + 1;
            return resolved.then.bind(resolved);
          }
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
  };
}

function makeRpcClient(fromClient: ReturnType<typeof makeFromClient>, rpcResults: Record<string, FakeResult>) {
  const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];
  return {
    calls: fromClient.calls,
    rpcCalls,
    client: {
      from: fromClient.from,
      rpc(fn: string, params: Record<string, unknown>) {
        rpcCalls.push({ fn, params });
        const result = rpcResults[fn] ?? { data: null, error: { message: `No fake rpc result configured for ${fn}` } };
        return Promise.resolve({ error: null, ...result });
      },
    } as never,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "mdl-1",
    entry_code: "MDL-20260815-000001",
    transaction_date: "2026-08-15",
    transaction_type: "Customer Payment TECH_H",
    party_type: "Money Changer",
    party_id: "party-1",
    currency: "VND",
    amount: 5_000_000,
    direction: "IN",
    transaction_group: null,
    fx_rate: null,
    linked_payment_id: "payment-1",
    linked_order_id: null,
    reference: null,
    note: null,
    status: "Recorded",
    created_by: null,
    created_at: "2026-08-15T00:00:00Z",
    ...overrides,
  };
}

test("getBalance: VND balance is SUM(IN) - SUM(OUT), independent of CNY", async () => {
  const { getBalance } = await import("./moneyDebtLedger.service");
  const rows = [
    { amount: 300_000_000, direction: "OUT" },
    { amount: 500_000_000, direction: "IN" },
    { amount: 100_000_000, direction: "IN" },
  ];
  const { client } = makeRpcClient(makeFromClient({ money_debt_ledger_entries: [{ data: rows }] }), {});

  const result = await getBalance("mc-1", "VND", client);
  assert.equal(result.total_in, 600_000_000);
  assert.equal(result.total_out, 300_000_000);
  assert.equal(result.balance, 300_000_000);
});

test("getAllBalances: keeps VND and CNY as two separate balances for the same party, never converts (D5)", async () => {
  const { getAllBalances } = await import("./moneyDebtLedger.service");
  const rows = [
    { party_id: "mc-1", currency: "VND", amount: 300_000_000, direction: "OUT" },
    { party_id: "mc-1", currency: "CNY", amount: 80_000, direction: "IN" },
    { party_id: "supplier-1", currency: "CNY", amount: 100_000, direction: "IN" },
    { party_id: "supplier-1", currency: "CNY", amount: 30_000, direction: "OUT" },
  ];
  const { client } = makeRpcClient(makeFromClient({ money_debt_ledger_entries: [{ data: rows }] }), {});

  const balances = await getAllBalances(client);
  assert.equal(balances.length, 3);

  const mcVnd = balances.find((b) => b.party_id === "mc-1" && b.currency === "VND")!;
  const mcCny = balances.find((b) => b.party_id === "mc-1" && b.currency === "CNY")!;
  const supplierCny = balances.find((b) => b.party_id === "supplier-1" && b.currency === "CNY")!;

  assert.equal(mcVnd.balance, -300_000_000);
  assert.equal(mcCny.balance, 80_000);
  assert.equal(supplierCny.balance, 70_000);
});

test("getLedgerEntries: filters by party, currency, and transaction_type", async () => {
  const { getLedgerEntries } = await import("./moneyDebtLedger.service");
  const { client, calls } = makeRpcClient(makeFromClient({ money_debt_ledger_entries: [{ data: [entry()] }] }), {});

  await getLedgerEntries({ partyId: "party-1", currency: "VND", transactionType: "Customer Payment TECH_H" }, client);

  assert.ok(calls.some((c) => c.method === "eq" && c.args[0] === "party_id" && c.args[1] === "party-1"));
  assert.ok(calls.some((c) => c.method === "eq" && c.args[0] === "currency" && c.args[1] === "VND"));
  assert.ok(calls.some((c) => c.method === "eq" && c.args[0] === "transaction_type" && c.args[1] === "Customer Payment TECH_H"));
});

test("getLedgerEntries: searchTerm matches entry_code, party name, reference, or transaction_group", async () => {
  const { getLedgerEntries } = await import("./moneyDebtLedger.service");
  const rows = [
    entry({ id: "a", entry_code: "MDL-20260815-000001" }),
    entry({ id: "b", entry_code: "MDL-20260815-000002", transaction_group: "FX-20260815-000001" }),
  ];
  const { client } = makeRpcClient(makeFromClient({ money_debt_ledger_entries: [{ data: rows }] }), {});

  const result = await getLedgerEntries({ searchTerm: "FX-20260815" }, client);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b");
});

test("createLedgerEntry: rejects non-positive amount before ever calling the RPC", async () => {
  const { createLedgerEntry, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () =>
      createLedgerEntry(
        { transaction_type: "VND Held By Money Changer", party_id: "mc-1", party_type: "Money Changer", currency: "VND", amount: 0 },
        "staff-1",
        client
      ),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createLedgerEntry: rejects a null staffId before ever calling the RPC (service_role calls carry no session to derive identity from otherwise)", async () => {
  const { createLedgerEntry, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () =>
      createLedgerEntry(
        { transaction_type: "VND Held By Money Changer", party_id: "mc-1", party_type: "Money Changer", currency: "VND", amount: 1000, direction: "IN" },
        null,
        client
      ),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createLedgerEntry: calls create_money_debt_ledger_entry with the mapped p_* parameters", async () => {
  const { createLedgerEntry } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {
    create_money_debt_ledger_entry: { data: entry({ transaction_type: "Deposit", currency: "CNY", direction: "IN" }) },
  });

  await createLedgerEntry(
    {
      transaction_type: "Deposit",
      party_id: "supplier-1",
      party_type: "Supplier",
      currency: "CNY",
      amount: 100_000,
      note: "Đặt cọc đợt 1",
    },
    "staff-1",
    client
  );

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "create_money_debt_ledger_entry");
  assert.equal(rpcCalls[0].params.p_transaction_type, "Deposit");
  assert.equal(rpcCalls[0].params.p_party_id, "supplier-1");
  assert.equal(rpcCalls[0].params.p_currency, "CNY");
  assert.equal(rpcCalls[0].params.p_amount, 100_000);
  // 2026-08-16 EXECUTE-privilege fix: create_money_debt_ledger_entry() is
  // now only reachable via the trusted service_role client (never anon/
  // authenticated — see 2026081715_money_debt_ledger_execute_privilege_fix.sql),
  // so identity is threaded through explicitly as p_staff_id rather than
  // resolved from an (absent, under service_role) session. This is not a
  // reversion of the earlier "don't trust caller-supplied identity" fix:
  // the only caller that can ever reach this function now is the trusted
  // Next.js server itself, which has already run requirePermission()
  // before calling it — never the browser.
  assert.equal(rpcCalls[0].params.p_staff_id, "staff-1");
  assert.equal("p_created_by" in rpcCalls[0].params, false);
});

test("SECURITY (C): a Forbidden response from the DB's own internal permission check (money_debt_ledger_staff_has_permission) surfaces as MoneyDebtLedgerRuleViolationError, same as any other RPC rule violation — the caller cannot distinguish 'permission denied at the DB' from any other rejection and get a different (bypassable) code path", async () => {
  const { createLedgerEntry, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client } = makeRpcClient(makeFromClient({}), {
    create_money_debt_ledger_entry: {
      data: null,
      error: { message: "Forbidden: money_debt_ledger.create permission required", code: "42501" },
    },
  });

  await assert.rejects(
    () =>
      createLedgerEntry(
        { transaction_type: "VND Held By Money Changer", party_id: "mc-1", party_type: "Money Changer", currency: "VND", amount: 1000, direction: "IN" },
        "staff-without-permission",
        client
      ),
    (err: unknown) => err instanceof MoneyDebtLedgerRuleViolationError && (err as Error).message.includes("Forbidden")
  );
});

test("createLedgerEntry: RPC rule violation (e.g. server-side over-reconciliation guard) surfaces as MoneyDebtLedgerRuleViolationError", async () => {
  const { createLedgerEntry, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client } = makeRpcClient(makeFromClient({}), {
    create_money_debt_ledger_entry: { data: null, error: { message: "Reconciling 5000000 would exceed Payment's own amount" } },
  });

  await assert.rejects(
    () =>
      createLedgerEntry(
        {
          transaction_type: "Customer Payment TECH_H",
          party_id: "mc-1",
          party_type: "Money Changer",
          currency: "VND",
          amount: 5_000_000,
          linked_payment_id: "payment-1",
        },
        "staff-1",
        client
      ),
    MoneyDebtLedgerRuleViolationError
  );
});

test("createBuyCnyTransaction: rejects non-positive fx_rate before calling the RPC", async () => {
  const { createBuyCnyTransaction, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () => createBuyCnyTransaction({ party_id: "mc-1", vnd_amount: 300_000_000, cny_amount: 80_000, fx_rate: 0 }, "staff-1", client),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createBuyCnyTransaction: rejects a null staffId before ever calling the RPC", async () => {
  const { createBuyCnyTransaction, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () => createBuyCnyTransaction({ party_id: "mc-1", vnd_amount: 300_000_000, cny_amount: 80_000, fx_rate: 3750 }, null, client),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createBuyCnyTransaction: calls create_buy_cny_ledger_transaction once and returns both rows (one VND OUT, one CNY IN)", async () => {
  const { createBuyCnyTransaction } = await import("./moneyDebtLedger.service");
  const vndRow = entry({ id: "mdl-vnd", transaction_type: "Buy CNY", currency: "VND", amount: 300_000_000, direction: "OUT", transaction_group: "FX-20260815-000001", fx_rate: 3750, linked_payment_id: null });
  const cnyRow = entry({ id: "mdl-cny", transaction_type: "Buy CNY", currency: "CNY", amount: 80_000, direction: "IN", transaction_group: "FX-20260815-000001", fx_rate: 3750, linked_payment_id: null });
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {
    create_buy_cny_ledger_transaction: { data: [cnyRow, vndRow] },
  });

  const result = await createBuyCnyTransaction({ party_id: "mc-1", vnd_amount: 300_000_000, cny_amount: 80_000, fx_rate: 3750 }, "staff-1", client);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "create_buy_cny_ledger_transaction");
  assert.equal(rpcCalls[0].params.p_vnd_amount, 300_000_000);
  assert.equal(rpcCalls[0].params.p_cny_amount, 80_000);
  assert.equal(rpcCalls[0].params.p_fx_rate, 3750);
  // 2026-08-16 EXECUTE-privilege fix — same reasoning as createLedgerEntry above.
  assert.equal(rpcCalls[0].params.p_staff_id, "staff-1");
  assert.equal("p_created_by" in rpcCalls[0].params, false);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.transaction_group),
    ["FX-20260815-000001", "FX-20260815-000001"]
  );
});

test("getTechHReconciliationCandidates: excludes a payment already fully reconciled, includes a partially reconciled one with the correct remaining amount", async () => {
  const { getTechHReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const payments = [
    { id: "payment-1", amount: 5_000_000, payment_date: "2026-08-15", order_id: "order-1", order: { id: "order-1", order_number: "ORD-1" } },
    { id: "payment-2", amount: 10_000_000, payment_date: "2026-08-14", order_id: "order-2", order: { id: "order-2", order_number: "ORD-2" } },
  ];
  const reconciledRows = [
    { linked_payment_id: "payment-1", amount: 5_000_000 }, // fully reconciled -> excluded
    { linked_payment_id: "payment-2", amount: 4_000_000 }, // partially reconciled -> remaining 6,000,000
  ];
  const { client } = makeRpcClient(
    makeFromClient({
      payments: [{ data: payments }],
      money_debt_ledger_entries: [{ data: reconciledRows }],
    }),
    {}
  );

  const result = await getTechHReconciliationCandidates(client);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "payment-2");
  assert.equal(result[0].remaining, 6_000_000);
});
