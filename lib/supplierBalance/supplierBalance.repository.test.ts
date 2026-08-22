import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Supplier Balance (Finance Project #1, Phase F re-scope, Product Owner
 * Approval 2026-08-21) — read-model repository test. Covers the Product
 * Owner's own required scenarios: IN only, OUT only, mixed, multiple
 * currencies, multiple transactions for one Supplier, multiple Suppliers,
 * correct Σ IN/Σ OUT/Balance, correct Last Transaction, no Payable/
 * Receivable classification, no duplicate counting.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

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

function ledgerRow(overrides: Record<string, unknown> = {}) {
  return {
    party_id: "supplier-1",
    currency: "CNY",
    amount: 100_000,
    direction: "IN",
    transaction_date: "2026-08-10",
    party: { id: "supplier-1", name: "NCC Nguyen", partner_code: "SUP001" },
    ...overrides,
  };
}

test("findSupplierBalances: IN only — totalIn = sum, totalOut = 0, balance = totalIn", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({
    money_debt_ledger_entries: { data: [ledgerRow({ amount: 300_000, direction: "IN" })] },
  });

  const rows = await findSupplierBalances({}, client);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalIn, 300_000);
  assert.equal(rows[0].totalOut, 0);
  assert.equal(rows[0].balance, 300_000);
});

test("findSupplierBalances: OUT only — totalOut = sum, totalIn = 0, balance = -totalOut (unclamped, semantically neutral)", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({
    money_debt_ledger_entries: { data: [ledgerRow({ amount: 150_000, direction: "OUT" })] },
  });

  const rows = await findSupplierBalances({}, client);

  assert.equal(rows[0].totalIn, 0);
  assert.equal(rows[0].totalOut, 150_000);
  assert.equal(rows[0].balance, -150_000);
});

test("findSupplierBalances: mixed IN/OUT — balance = Σ IN − Σ OUT exactly", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({
    money_debt_ledger_entries: {
      data: [
        ledgerRow({ amount: 500_000, direction: "IN", transaction_date: "2026-08-01" }),
        ledgerRow({ amount: 200_000, direction: "OUT", transaction_date: "2026-08-05" }),
        ledgerRow({ amount: 100_000, direction: "IN", transaction_date: "2026-08-08" }),
      ],
    },
  });

  const rows = await findSupplierBalances({}, client);

  assert.equal(rows[0].totalIn, 600_000);
  assert.equal(rows[0].totalOut, 200_000);
  assert.equal(rows[0].balance, 400_000);
  assert.equal(rows[0].transactionCount, 3, "must count every transaction exactly once, never double-counted");
});

test("findSupplierBalances: multiple currencies for the same Supplier produce two separate rows, never combined", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({
    money_debt_ledger_entries: {
      data: [
        ledgerRow({ currency: "CNY", amount: 1000, direction: "IN" }),
        ledgerRow({ currency: "VND", amount: 5_000_000, direction: "IN" }),
      ],
    },
  });

  const rows = await findSupplierBalances({}, client);

  assert.equal(rows.length, 2);
  const cnyRow = rows.find((r) => r.currency === "CNY")!;
  const vndRow = rows.find((r) => r.currency === "VND")!;
  assert.equal(cnyRow.totalIn, 1000);
  assert.equal(vndRow.totalIn, 5_000_000);
});

test("findSupplierBalances: Last Transaction is the most recent transaction_date, not the last array entry", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({
    money_debt_ledger_entries: {
      data: [
        ledgerRow({ transaction_date: "2026-08-05" }),
        ledgerRow({ transaction_date: "2026-08-20" }),
        ledgerRow({ transaction_date: "2026-08-10" }),
      ],
    },
  });

  const rows = await findSupplierBalances({}, client);
  assert.equal(rows[0].lastTransactionDate, "2026-08-20");
});

test("findSupplierBalances: multiple Suppliers each get their own row with their own correct figures", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({
    money_debt_ledger_entries: {
      data: [
        ledgerRow({ party_id: "supplier-1", party: { id: "supplier-1", name: "NCC A", partner_code: "SUP001" }, amount: 100_000, direction: "IN" }),
        ledgerRow({ party_id: "supplier-2", party: { id: "supplier-2", name: "NCC B", partner_code: "SUP002" }, amount: 50_000, direction: "OUT" }),
      ],
    },
  });

  const rows = await findSupplierBalances({}, client);

  assert.equal(rows.length, 2);
  const a = rows.find((r) => r.partyId === "supplier-1")!;
  const b = rows.find((r) => r.partyId === "supplier-2")!;
  assert.equal(a.balance, 100_000);
  assert.equal(b.balance, -50_000);
});

test("findSupplierBalances: query is scoped to party_type='Supplier' — Money Changer rows are never included", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client, calls } = makeClient({ money_debt_ledger_entries: { data: [] } });

  await findSupplierBalances({}, client);

  const eqCall = calls.find((c) => c.table === "money_debt_ledger_entries" && c.method === "eq" && c.args[0] === "party_type");
  assert.deepEqual(eqCall!.args, ["party_type", "Supplier"]);
});

test("findSupplierBalances: currency filter narrows the query server-side", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client, calls } = makeClient({ money_debt_ledger_entries: { data: [] } });

  await findSupplierBalances({ currency: "CNY" }, client);

  const eqCall = calls.find((c) => c.table === "money_debt_ledger_entries" && c.method === "eq" && c.args[0] === "currency");
  assert.deepEqual(eqCall!.args, ["currency", "CNY"]);
});

test("findSupplierBalances: searchTerm matches supplier name or code", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({
    money_debt_ledger_entries: {
      data: [
        ledgerRow({ party_id: "supplier-1", party: { id: "supplier-1", name: "NCC Nguyen", partner_code: "SUP001" } }),
        ledgerRow({ party_id: "supplier-2", party: { id: "supplier-2", name: "NCC Tran", partner_code: "SUP002" } }),
      ],
    },
  });

  const rows = await findSupplierBalances({ searchTerm: "SUP002" }, client);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].partyId, "supplier-2");
});

test("findSupplierBalances: Data Scope — deliberately not applied, matching money_debt_ledger_entries' own established pattern (no sales_owner/staff-attribution dimension exists on this table anywhere in this codebase)", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client, calls } = makeClient({
    money_debt_ledger_entries: {
      data: [ledgerRow({ party_id: "supplier-1" }), ledgerRow({ party_id: "supplier-2", party: { id: "supplier-2", name: "NCC B", partner_code: "SUP002" } })],
    },
  });

  // No staff/actor parameter exists on this function's own signature at
  // all — calling it with only filters+client already proves no Data
  // Scope call can happen (there is no staff to scope by). This test
  // additionally asserts every Supplier's rows are returned unfiltered,
  // confirming no hidden staff-based restriction exists in the query
  // itself either.
  const rows = await findSupplierBalances({}, client);

  assert.equal(rows.length, 2, "both Suppliers' balances must be visible to any authorized caller — no per-staff scoping exists for this data");
  assert.ok(
    !calls.some((c) => c.method === "eq" && (c.args[0] === "sales_owner" || String(c.args[0]).includes("staff"))),
    "the query must never filter by sales_owner or any staff-attribution column — money_debt_ledger_entries has no such dimension"
  );
});

test("findSupplierBalances: no ledger rows — empty result, never throws", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({ money_debt_ledger_entries: { data: [] } });

  const rows = await findSupplierBalances({}, client);
  assert.deepEqual(rows, []);
});

test("findSupplierBalances: the row shape introduces no Payable/Receivable/Owed classification — only the neutral fields the Product Owner authorized", async () => {
  const { findSupplierBalances } = await import("./supplierBalance.repository");
  const { client } = makeClient({ money_debt_ledger_entries: { data: [ledgerRow()] } });

  const rows = await findSupplierBalances({}, client);

  const keys = Object.keys(rows[0]).sort();
  assert.deepEqual(keys, [
    "balance",
    "currency",
    "lastTransactionDate",
    "partyId",
    "supplierCode",
    "supplierName",
    "totalIn",
    "totalOut",
    "transactionCount",
  ]);
  for (const forbidden of ["payable", "receivable", "owed", "due", "status"]) {
    assert.ok(!keys.some((k) => k.toLowerCase().includes(forbidden)), `row shape must never include a "${forbidden}"-named field`);
  }
});
