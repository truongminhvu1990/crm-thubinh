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

test("getLedgerEntries: attaches group_counterparty for a paired transaction (e.g. Supplier Payment via Money Changer's Money-Changer leg resolves the Supplier via transaction_group)", async () => {
  const { getLedgerEntries } = await import("./moneyDebtLedger.service");
  const moneyChangerParty = { id: "mc-1", name: "Hạnh", partner_code: "PTR-1", partner_type: "Money Changer" };
  const supplierParty = { id: "sup-1", name: "Nhà Hoa", partner_code: "PTR-2", partner_type: "Supplier" };
  const vndLeg = entry({
    id: "mdl-vnd",
    transaction_type: "Supplier Payment via Money Changer",
    party_id: "mc-1",
    party_type: "Money Changer",
    party: moneyChangerParty,
    currency: "VND",
    amount: 32_000_000,
    direction: "OUT",
    transaction_group: "SPMC-20260817-000001",
    fx_rate: 4000,
  });
  // First queued response = the main filtered query; second = the
  // transaction_group counterparty lookup (both legs, since the fake
  // .in() is a no-op and returns whatever's queued).
  const { client } = makeRpcClient(
    makeFromClient({
      money_debt_ledger_entries: [
        { data: [vndLeg] },
        {
          data: [
            { id: "mdl-vnd", transaction_group: "SPMC-20260817-000001", party_id: "mc-1", party: moneyChangerParty },
            { id: "mdl-cny", transaction_group: "SPMC-20260817-000001", party_id: "sup-1", party: supplierParty },
          ],
        },
      ],
    }),
    {}
  );

  const result = await getLedgerEntries({}, client);
  assert.equal(result.length, 1);
  assert.equal(result[0].group_counterparty?.id, "sup-1");
  assert.equal(result[0].group_counterparty?.name, "Nhà Hoa");
});

test("getLedgerEntries: a row with no transaction_group never triggers the counterparty lookup query, and group_counterparty stays unset", async () => {
  const { getLedgerEntries } = await import("./moneyDebtLedger.service");
  const { client, calls } = makeRpcClient(makeFromClient({ money_debt_ledger_entries: [{ data: [entry()] }] }), {});

  const result = await getLedgerEntries({}, client);
  assert.equal(result.length, 1);
  assert.equal(result[0].group_counterparty, undefined);
  // Only one .from("money_debt_ledger_entries") round trip happened —
  // no counterparty lookup was issued for an ungrouped row.
  assert.equal(calls.filter((c) => c.table === "money_debt_ledger_entries" && c.method === "select").length, 1);
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
  // payment_method values reflect real Production data (2026-08-16 audit):
  // "Tech_H" (canonical master-data spelling) and "TechH" (legacy, no
  // master-data row) are both real historical spellings of the same
  // channel — see moneyDebtLedger.constants.ts's TECH_H_PAYMENT_METHODS.
  const payments = [
    { id: "payment-1", amount: 5_000_000, payment_date: "2026-08-15", order_id: "order-1", order: { id: "order-1", order_number: "ORD-1" }, payment_method: "Tech_H" },
    { id: "payment-2", amount: 10_000_000, payment_date: "2026-08-14", order_id: "order-2", order: { id: "order-2", order_number: "ORD-2" }, payment_method: "TechH" },
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

test("getTechHReconciliationCandidates: queries payments using .in(\"payment_method\", TECH_H_PAYMENT_METHODS) — the explicit historical alias set, never a bare .eq(\"payment_method\", \"TECH_H\")", async () => {
  const { getTechHReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const { TECH_H_PAYMENT_METHODS } = await import("./moneyDebtLedger.constants");
  const { calls, client } = makeRpcClient(
    makeFromClient({
      payments: [{ data: [] }],
      money_debt_ledger_entries: [{ data: [] }],
    }),
    {}
  );

  await getTechHReconciliationCandidates(client);

  const paymentsFilterCall = calls.find((c) => c.table === "payments" && c.method === "in");
  assert.ok(paymentsFilterCall, "Expected an .in() call filtering the payments table");
  assert.deepEqual(paymentsFilterCall!.args, ["payment_method", TECH_H_PAYMENT_METHODS]);

  // Root-cause regression guard: the original bug was a bare .eq("payment_method", "TECH_H"),
  // which matched zero real Production payments. Must never come back.
  const bareEqCall = calls.find((c) => c.table === "payments" && c.method === "eq" && c.args[0] === "payment_method");
  assert.equal(bareEqCall, undefined, "Must not filter payments.payment_method via .eq() at all — must use the explicit alias set via .in()");
});

/**
 * Stage 5 (Product Owner Locked Decisions, 2026-08-16), Phase 4/5/11 —
 * getReconciliationCandidates() combines two independent, additive
 * sources: getTechHReconciliationCandidates (unchanged, above) and the new
 * getReceivingAccountReconciliationCandidates (payment_method-agnostic,
 * driven entirely by receiving_accounts.money_changer_partner_id). Each
 * call to getReconciliationCandidates queries `payments` and
 * `money_debt_ledger_entries` twice — once per source function,
 * sequentially (not Promise.all, by design) — so each fake table needs 2
 * queued responses in call order: [historical, generic].
 */

function receivingAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ra-1",
    currency: "VND",
    account_number: "****1234",
    label: null,
    money_changer_partner_id: "mc-1",
    bank: { value: "vcb" },
    owner: { name: "Vũ" },
    money_changer: { name: "H" },
    ...overrides,
  };
}

test("getReconciliationCandidates: includes a historical Tech_H payment (payment_method-based path, unchanged)", async () => {
  const { getReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const historicalPayments = [
    { id: "payment-1", amount: 5_000_000, payment_date: "2026-08-15", order_id: "order-1", order: { id: "order-1", order_number: "ORD-1" }, payment_method: "Tech_H" },
  ];
  const { client } = makeRpcClient(
    makeFromClient({
      payments: [{ data: historicalPayments }, { data: [] }],
      money_debt_ledger_entries: [{ data: [] }, { data: [] }],
    }),
    {}
  );

  const result = await getReconciliationCandidates(client);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "payment-1");
  assert.equal(result[0].receiving_account_id, null, "Historical candidates must never fabricate receiving-account data");
  assert.equal(result[0].money_changer_partner_id, null);
});

test("getReconciliationCandidates: includes a historical TechH payment (the other real legacy spelling, unchanged)", async () => {
  const { getReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const historicalPayments = [
    { id: "payment-2", amount: 10_000_000, payment_date: "2026-08-14", order_id: "order-2", order: { id: "order-2", order_number: "ORD-2" }, payment_method: "TechH" },
  ];
  const { client } = makeRpcClient(
    makeFromClient({
      payments: [{ data: historicalPayments }, { data: [] }],
      money_debt_ledger_entries: [{ data: [] }, { data: [] }],
    }),
    {}
  );

  const result = await getReconciliationCandidates(client);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "payment-2");
});

test("getReconciliationCandidates: includes a generic Receiving-Account candidate when its account has a configured Money Changer association", async () => {
  const { getReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const genericPayments = [
    {
      id: "payment-3",
      amount: 7_000_000,
      payment_date: "2026-08-16",
      order_id: "order-3",
      payment_method: "Bank Transfer",
      receiving_account_id: "ra-1",
      order: { id: "order-3", order_number: "ORD-3", customer: null },
      receiving_account: receivingAccountRow(),
    },
  ];
  const { client } = makeRpcClient(
    makeFromClient({
      payments: [{ data: [] }, { data: genericPayments }],
      money_debt_ledger_entries: [{ data: [] }, { data: [] }],
    }),
    {}
  );

  const result = await getReconciliationCandidates(client);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "payment-3");
  assert.equal(result[0].receiving_account_id, "ra-1");
  assert.equal(result[0].bank, "vcb");
  assert.equal(result[0].account_owner, "Vũ");
  assert.equal(result[0].money_changer_partner_id, "mc-1");
  assert.equal(result[0].money_changer_name, "H", "Pre-fill data contract: the UI reads this field to pre-select the Money Changer picker");
});

test("getReceivingAccountReconciliationCandidates: a payment with a Receiving Account that has NO configured Money Changer association is excluded — never inferred from owner_partner_id or bank/owner names", async () => {
  const { getReceivingAccountReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const payments = [
    {
      id: "payment-4",
      amount: 1_000_000,
      payment_date: "2026-08-16",
      order_id: "order-4",
      payment_method: "Bank Transfer",
      receiving_account_id: "ra-2",
      order: null,
      receiving_account: receivingAccountRow({ id: "ra-2", money_changer_partner_id: null, money_changer: null }),
    },
  ];
  const { client } = makeRpcClient(
    makeFromClient({ payments: [{ data: payments }], money_debt_ledger_entries: [{ data: [] }] }),
    {}
  );

  const result = await getReceivingAccountReconciliationCandidates(client);
  assert.equal(result.length, 0, "No money_changer_partner_id on the receiving account means no candidate — not even a coincidental owner match");
});

test("getReceivingAccountReconciliationCandidates: an unrelated payment_method (e.g. 'tiền mặt') with no receiving_account_id is simply never queried into this path at all (the .not(receiving_account_id, is, null) filter excludes it at the DB level)", async () => {
  const { getReceivingAccountReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const { client, calls } = makeRpcClient(
    makeFromClient({ payments: [{ data: [] }], money_debt_ledger_entries: [{ data: [] }] }),
    {}
  );

  await getReceivingAccountReconciliationCandidates(client);
  const notNullCall = calls.find((c) => c.table === "payments" && c.method === "not");
  assert.ok(notNullCall, "Expected a .not() call filtering payments.receiving_account_id IS NOT NULL");
  assert.deepEqual(notNullCall!.args, ["receiving_account_id", "is", null]);
});

test("getReceivingAccountReconciliationCandidates: partial reconciliation — an already-partially-reconciled generic candidate reports the correct remaining amount and stays included", async () => {
  const { getReceivingAccountReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const payments = [
    {
      id: "payment-5",
      amount: 10_000_000,
      payment_date: "2026-08-16",
      order_id: "order-5",
      payment_method: "Bank Transfer",
      receiving_account_id: "ra-1",
      order: null,
      receiving_account: receivingAccountRow(),
    },
  ];
  const reconciled = [{ linked_payment_id: "payment-5", amount: 4_000_000 }];
  const { client } = makeRpcClient(
    makeFromClient({ payments: [{ data: payments }], money_debt_ledger_entries: [{ data: reconciled }] }),
    {}
  );

  const result = await getReceivingAccountReconciliationCandidates(client);
  assert.equal(result.length, 1);
  assert.equal(result[0].already_reconciled, 4_000_000);
  assert.equal(result[0].remaining, 6_000_000);
});

test("getReceivingAccountReconciliationCandidates: over-reconciliation guard — a generic candidate already fully reconciled is excluded, same as the historical path", async () => {
  const { getReceivingAccountReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const payments = [
    {
      id: "payment-6",
      amount: 2_000_000,
      payment_date: "2026-08-16",
      order_id: "order-6",
      payment_method: "Bank Transfer",
      receiving_account_id: "ra-1",
      order: null,
      receiving_account: receivingAccountRow(),
    },
  ];
  const reconciled = [{ linked_payment_id: "payment-6", amount: 2_000_000 }];
  const { client } = makeRpcClient(
    makeFromClient({ payments: [{ data: payments }], money_debt_ledger_entries: [{ data: reconciled }] }),
    {}
  );

  const result = await getReceivingAccountReconciliationCandidates(client);
  assert.equal(result.length, 0);
});

test("getReconciliationCandidates: candidate detection alone never calls any RPC — pure read, no automatic ledger entry (Phase 8/12/13)", async () => {
  const { getReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(
    makeFromClient({
      payments: [{ data: [] }, { data: [] }],
      money_debt_ledger_entries: [{ data: [] }, { data: [] }],
    }),
    {}
  );

  await getReconciliationCandidates(client);
  assert.equal(rpcCalls.length, 0);
});

test("getReconciliationCandidates: deduplicates by payment id if a payment somehow appears in both source lists (defensive — cannot happen given Stage 3's mutual-exclusivity rule, but must not double-count if it ever did)", async () => {
  const { getReconciliationCandidates } = await import("./moneyDebtLedger.service");
  const sharedId = "payment-7";
  const historicalPayments = [
    { id: sharedId, amount: 1_000_000, payment_date: "2026-08-16", order_id: "order-7", order: null, payment_method: "Tech_H" },
  ];
  const genericPayments = [
    {
      id: sharedId,
      amount: 1_000_000,
      payment_date: "2026-08-16",
      order_id: "order-7",
      payment_method: "Bank Transfer",
      receiving_account_id: "ra-1",
      order: null,
      receiving_account: receivingAccountRow(),
    },
  ];
  const { client } = makeRpcClient(
    makeFromClient({
      payments: [{ data: historicalPayments }, { data: genericPayments }],
      money_debt_ledger_entries: [{ data: [] }, { data: [] }],
    }),
    {}
  );

  const result = await getReconciliationCandidates(client);
  assert.equal(result.length, 1);
});

test("TECH_H_PAYMENT_METHODS: recognizes exactly the two real historical Production spellings (\"Tech_H\", \"TechH\") — narrow and explicit, not case-insensitive, not a literal \"TECH_H\", not unrelated methods", async () => {
  const { TECH_H_PAYMENT_METHODS } = await import("./moneyDebtLedger.constants");

  // 1 & 2: both real historical spellings recognized.
  assert.ok(TECH_H_PAYMENT_METHODS.includes("Tech_H"), "Canonical master-data spelling must be recognized");
  assert.ok(TECH_H_PAYMENT_METHODS.includes("TechH"), "Legacy alias (no master-data row) must be recognized");

  // 3: "TECH_H" (the original, incorrect literal — zero real Production
  // payments) must NOT be silently treated as a valid payment-method value.
  assert.ok(!TECH_H_PAYMENT_METHODS.includes("TECH_H"), "\"TECH_H\" has zero historical Production payments and must not be included");

  // 4: unrelated existing payment methods must not be swept in.
  for (const unrelated of ["Tech_HKD", "Tech_B", "Cash"]) {
    assert.ok(!TECH_H_PAYMENT_METHODS.includes(unrelated), `"${unrelated}" is a distinct payment method and must not be included`);
  }

  // Narrow and explicit: exactly these two values, nothing broader (e.g. no
  // case-insensitive/contains-based matching was introduced as a side effect).
  assert.deepEqual([...TECH_H_PAYMENT_METHODS].sort(), ["TechH", "Tech_H"]);
});

// ============================================================
// Stage 19 (Product Owner Locked Business Contract, 2026-08-17) —
// syncPaymentToMoneyDebtLedger: pure RPC-call-shape coverage. The DB
// function's own eligibility/idempotency/concurrency behavior is verified
// live against real Dev (this stage's E2E report), not re-derived here —
// this suite only proves the JS wrapper calls the right RPC with the
// right parameters and surfaces errors the same way every other RPC call
// in this file already does.
// ============================================================

test("syncPaymentToMoneyDebtLedger: calls sync_payment_to_money_debt_ledger with the mapped p_* parameters", async () => {
  const { syncPaymentToMoneyDebtLedger } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {
    sync_payment_to_money_debt_ledger: { data: entry({ transaction_type: "Customer Payment via Money Changer", linked_payment_id: "payment-1" }) },
  });

  await syncPaymentToMoneyDebtLedger("payment-1", "staff-1", client);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "sync_payment_to_money_debt_ledger");
  assert.equal(rpcCalls[0].params.p_payment_id, "payment-1");
  assert.equal(rpcCalls[0].params.p_staff_id, "staff-1");
});

test("syncPaymentToMoneyDebtLedger: returns null (not an error) when the payment is not eligible — the DB function's own valid 'nothing to sync' outcome", async () => {
  const { syncPaymentToMoneyDebtLedger } = await import("./moneyDebtLedger.service");
  const { client } = makeRpcClient(makeFromClient({}), {
    sync_payment_to_money_debt_ledger: { data: null },
  });

  const result = await syncPaymentToMoneyDebtLedger("payment-2", "staff-1", client);
  assert.equal(result, null);
});

test("syncPaymentToMoneyDebtLedger: an RPC-level rejection (e.g. staff lacks money_debt_ledger.create) surfaces as MoneyDebtLedgerRuleViolationError, same as every other governed write in this file", async () => {
  const { syncPaymentToMoneyDebtLedger, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client } = makeRpcClient(makeFromClient({}), {
    sync_payment_to_money_debt_ledger: { data: null, error: { message: "Forbidden: money_debt_ledger.create permission required" } },
  });

  await assert.rejects(() => syncPaymentToMoneyDebtLedger("payment-3", "staff-without-permission", client), MoneyDebtLedgerRuleViolationError);
});

// ============================================================
// Stage 19B (Product Owner "COMPLETE MONEY/DEBT BUSINESS FLOW", 2026-08-17)
// — createSupplierPaymentViaMoneyChanger / createMoneyDebtLedgerCorrection:
// pure RPC-call-shape coverage, same reasoning as syncPaymentToMoneyDebt-
// Ledger's own suite above. Balance-guard/negative-rejection behavior is
// verified live against real Dev (this stage's E2E report), not re-derived
// here.
// ============================================================

test("createSupplierPaymentViaMoneyChanger: rejects non-positive fx_rate before calling the RPC", async () => {
  const { createSupplierPaymentViaMoneyChanger, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () =>
      createSupplierPaymentViaMoneyChanger(
        { money_changer_partner_id: "mc-1", supplier_partner_id: "sup-1", cny_amount: 8_000, fx_rate: 0 },
        "staff-1",
        client
      ),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createSupplierPaymentViaMoneyChanger: rejects a null staffId before ever calling the RPC", async () => {
  const { createSupplierPaymentViaMoneyChanger, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () =>
      createSupplierPaymentViaMoneyChanger(
        { money_changer_partner_id: "mc-1", supplier_partner_id: "sup-1", cny_amount: 8_000, fx_rate: 4_000 },
        null,
        client
      ),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createSupplierPaymentViaMoneyChanger: calls create_supplier_payment_via_money_changer once and returns both rows (VND OUT against Money Changer, CNY OUT against Supplier)", async () => {
  const { createSupplierPaymentViaMoneyChanger } = await import("./moneyDebtLedger.service");
  const vndRow = entry({
    id: "mdl-vnd",
    transaction_type: "Supplier Payment via Money Changer",
    party_type: "Money Changer",
    party_id: "mc-1",
    currency: "VND",
    amount: 32_000_000,
    direction: "OUT",
    transaction_group: "SPMC-20260817-000001",
    fx_rate: 4_000,
    linked_payment_id: null,
  });
  const cnyRow = entry({
    id: "mdl-cny",
    transaction_type: "Supplier Payment via Money Changer",
    party_type: "Supplier",
    party_id: "sup-1",
    currency: "CNY",
    amount: 8_000,
    direction: "OUT",
    transaction_group: "SPMC-20260817-000001",
    fx_rate: 4_000,
    linked_payment_id: null,
  });
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {
    create_supplier_payment_via_money_changer: { data: [cnyRow, vndRow] },
  });

  const result = await createSupplierPaymentViaMoneyChanger(
    { money_changer_partner_id: "mc-1", supplier_partner_id: "sup-1", cny_amount: 8_000, fx_rate: 4_000 },
    "staff-1",
    client
  );

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "create_supplier_payment_via_money_changer");
  assert.equal(rpcCalls[0].params.p_money_changer_partner_id, "mc-1");
  assert.equal(rpcCalls[0].params.p_supplier_partner_id, "sup-1");
  assert.equal(rpcCalls[0].params.p_cny_amount, 8_000);
  assert.equal(rpcCalls[0].params.p_fx_rate, 4_000);
  assert.equal(rpcCalls[0].params.p_staff_id, "staff-1");
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.transaction_group),
    ["SPMC-20260817-000001", "SPMC-20260817-000001"]
  );
});

test("createSupplierPaymentViaMoneyChanger: an RPC-level rejection (insufficient Money Changer balance) surfaces as MoneyDebtLedgerRuleViolationError", async () => {
  const { createSupplierPaymentViaMoneyChanger, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client } = makeRpcClient(makeFromClient({}), {
    create_supplier_payment_via_money_changer: { data: null, error: { message: "Insufficient Money Changer VND balance: has 0, needs 32000000 (CNY 8000 x rate 4000)" } },
  });

  await assert.rejects(
    () =>
      createSupplierPaymentViaMoneyChanger(
        { money_changer_partner_id: "mc-1", supplier_partner_id: "sup-1", cny_amount: 8_000, fx_rate: 4_000 },
        "staff-1",
        client
      ),
    MoneyDebtLedgerRuleViolationError
  );
});

test("createMoneyDebtLedgerCorrection: rejects a non-positive amount before calling the RPC", async () => {
  const { createMoneyDebtLedgerCorrection, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () => createMoneyDebtLedgerCorrection({ corrects_entry_id: "mdl-1", amount: 0, direction: "IN" }, "staff-1", client),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createMoneyDebtLedgerCorrection: rejects a null staffId before ever calling the RPC", async () => {
  const { createMoneyDebtLedgerCorrection, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {});

  await assert.rejects(
    () => createMoneyDebtLedgerCorrection({ corrects_entry_id: "mdl-1", amount: 500_000, direction: "IN" }, null, client),
    MoneyDebtLedgerRuleViolationError
  );
  assert.equal(rpcCalls.length, 0);
});

test("createMoneyDebtLedgerCorrection: calls create_money_debt_ledger_correction with the mapped p_* parameters and returns the new Adjustment row", async () => {
  const { createMoneyDebtLedgerCorrection } = await import("./moneyDebtLedger.service");
  const correctionRow = entry({
    id: "mdl-correction",
    transaction_type: "Adjustment",
    currency: "VND",
    amount: 500_000,
    direction: "IN",
    corrects_entry_id: "mdl-original",
  });
  const { client, rpcCalls } = makeRpcClient(makeFromClient({}), {
    create_money_debt_ledger_correction: { data: correctionRow },
  });

  const result = await createMoneyDebtLedgerCorrection(
    { corrects_entry_id: "mdl-original", amount: 500_000, direction: "IN", reference: "Correction of MDL-20260817-000001" },
    "staff-1",
    client
  );

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, "create_money_debt_ledger_correction");
  assert.equal(rpcCalls[0].params.p_corrects_entry_id, "mdl-original");
  assert.equal(rpcCalls[0].params.p_amount, 500_000);
  assert.equal(rpcCalls[0].params.p_direction, "IN");
  assert.equal(rpcCalls[0].params.p_staff_id, "staff-1");
  assert.equal(result.corrects_entry_id, "mdl-original");
});

test("createMoneyDebtLedgerCorrection: an RPC-level rejection (correction would take balance negative) surfaces as MoneyDebtLedgerRuleViolationError", async () => {
  const { createMoneyDebtLedgerCorrection, MoneyDebtLedgerRuleViolationError } = await import("./moneyDebtLedger.service");
  const { client } = makeRpcClient(makeFromClient({}), {
    create_money_debt_ledger_correction: { data: null, error: { message: "This correction would take Money Changer mc-1's VND balance negative: has 12000000, correction reduces by 22000000" } },
  });

  await assert.rejects(
    () => createMoneyDebtLedgerCorrection({ corrects_entry_id: "mdl-original", amount: 22_000_000, direction: "OUT" }, "staff-1", client),
    MoneyDebtLedgerRuleViolationError
  );
});
