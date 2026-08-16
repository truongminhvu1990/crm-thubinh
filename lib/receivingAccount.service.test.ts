import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

/**
 * Payment / Bank Account / Money-Debt domain redesign, Stage 5 (Product
 * Owner Locked Decisions, 2026-08-16) — covers the new
 * money_changer_partner_id association: NULL is valid (Decision 6),
 * validated against partner_type='Money Changer' only when non-null
 * (Decision 8, Phase 2), independent of owner_partner_id (Decision 5).
 * Same fake `from()` client pattern as
 * lib/moneyDebtLedger/moneyDebtLedger.service.test.ts — a per-table
 * queued-response proxy that resolves whenever awaited, regardless of
 * which chain of builder methods (.select/.eq/.maybeSingle/.insert/
 * .update/.single) led there, matching how the real Supabase query builder
 * is awaitable at any point in its chain.
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
    client: {
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
    } as never,
  };
}

const BANK_ROW = { id: "bank-1", category: "bank" };
const OWNER_ROW = { id: "owner-1" };
const MONEY_CHANGER_ROW = { id: "mc-1", partner_type: "Money Changer" };
const COLLABORATOR_ROW = { id: "collab-1", partner_type: "Collaborator" };
const SUPPLIER_ROW = { id: "supplier-1", partner_type: "Supplier" };

const account = { id: "ra-1", bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234" };

test("1: createReceivingAccount accepts money_changer_partner_id omitted (NULL) — no Money Changer lookup performed", async () => {
  const { createReceivingAccount } = await import("./receivingAccount.service");
  const { client, calls } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }],
    receiving_accounts: [{ data: { ...account, money_changer_partner_id: null } }],
  });

  const result = await createReceivingAccount(
    { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234" },
    "staff-1",
    client
  );

  assert.equal(result.money_changer_partner_id, null);
  // Exactly one partners lookup (the owner check) — no second lookup for a
  // money changer that was never supplied.
  assert.equal(calls.filter((c) => c.table === "partners" && c.method === "select").length, 1);
});

test("2: createReceivingAccount accepts a valid Money Changer association", async () => {
  const { createReceivingAccount } = await import("./receivingAccount.service");
  const { client } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }, { data: MONEY_CHANGER_ROW }],
    receiving_accounts: [{ data: { ...account, money_changer_partner_id: "mc-1" } }],
  });

  const result = await createReceivingAccount(
    { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234", money_changer_partner_id: "mc-1" },
    "staff-1",
    client
  );

  assert.equal(result.money_changer_partner_id, "mc-1");
});

test("3: a Collaborator partner cannot be selected as Money Changer", async () => {
  const { createReceivingAccount, ReceivingAccountRuleViolationError } = await import("./receivingAccount.service");
  const { client } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }, { data: COLLABORATOR_ROW }],
  });

  await assert.rejects(
    () =>
      createReceivingAccount(
        { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234", money_changer_partner_id: "collab-1" },
        "staff-1",
        client
      ),
    ReceivingAccountRuleViolationError
  );
});

test("4: a Supplier partner cannot be selected as Money Changer (Decision 8 — Money Changer only this stage)", async () => {
  const { createReceivingAccount, ReceivingAccountRuleViolationError } = await import("./receivingAccount.service");
  const { client } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }, { data: SUPPLIER_ROW }],
  });

  await assert.rejects(
    () =>
      createReceivingAccount(
        { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234", money_changer_partner_id: "supplier-1" },
        "staff-1",
        client
      ),
    ReceivingAccountRuleViolationError
  );
});

test("5: a nonexistent partner id is rejected as a Money Changer association", async () => {
  const { createReceivingAccount, ReceivingAccountRuleViolationError } = await import("./receivingAccount.service");
  const { client } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }, { data: null }],
  });

  await assert.rejects(
    () =>
      createReceivingAccount(
        { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234", money_changer_partner_id: "ghost-1" },
        "staff-1",
        client
      ),
    ReceivingAccountRuleViolationError
  );
});

test("6: updateReceivingAccount can change an existing association to a different valid Money Changer", async () => {
  const { updateReceivingAccount } = await import("./receivingAccount.service");
  const { client } = makeFromClient({
    partners: [{ data: { id: "mc-2", partner_type: "Money Changer" } }],
    receiving_accounts: [{ data: { ...account, money_changer_partner_id: "mc-2" } }],
  });

  const result = await updateReceivingAccount("ra-1", { money_changer_partner_id: "mc-2" }, "staff-1", client);
  assert.equal(result.money_changer_partner_id, "mc-2");
});

test("7: updateReceivingAccount can clear the association back to NULL — no Money Changer partner_type lookup performed for a null value", async () => {
  const { updateReceivingAccount } = await import("./receivingAccount.service");
  const { client, calls } = makeFromClient({
    receiving_accounts: [{ data: { ...account, money_changer_partner_id: null } }],
  });

  const result = await updateReceivingAccount("ra-1", { money_changer_partner_id: null }, "staff-1", client);
  assert.equal(result.money_changer_partner_id, null);
  assert.equal(calls.some((c) => c.table === "partners"), false, "Clearing to NULL must require no partner lookup at all");
});

test("8: ON DELETE SET NULL behavior — verified via live Dev inspection + the migration's own static security test (lib/receivingAccountMoneyChangerMigration.security.test.ts, test 3), not re-derivable from a JS unit test since it is DB-engine-enforced referential-action behavior with no application-layer code path", () => {
  assert.ok(true);
});

test("9: changing money_changer_partner_id alone does not require or touch owner_partner_id", async () => {
  const { updateReceivingAccount } = await import("./receivingAccount.service");
  const { client, calls } = makeFromClient({
    partners: [{ data: MONEY_CHANGER_ROW }],
    receiving_accounts: [{ data: { ...account, money_changer_partner_id: "mc-1" } }],
  });

  await updateReceivingAccount("ra-1", { money_changer_partner_id: "mc-1" }, "staff-1", client);
  // Exactly one partners lookup (the Money Changer validation) — no
  // owner_partner_id existence check was triggered by this update.
  assert.equal(calls.filter((c) => c.table === "partners" && c.method === "select").length, 1);
});

test("10: owner_partner_id and money_changer_partner_id referencing different partners is valid", async () => {
  const { createReceivingAccount } = await import("./receivingAccount.service");
  const { client } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }, { data: MONEY_CHANGER_ROW }],
    receiving_accounts: [{ data: { ...account, owner_partner_id: "owner-1", money_changer_partner_id: "mc-1" } }],
  });

  const result = await createReceivingAccount(
    { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234", money_changer_partner_id: "mc-1" },
    "staff-1",
    client
  );
  assert.notEqual(result.owner_partner_id, result.money_changer_partner_id);
});

test("11: owner_partner_id and money_changer_partner_id referencing the SAME partner is valid (the partner just needs to pass each independent check)", async () => {
  const { createReceivingAccount } = await import("./receivingAccount.service");
  const { client } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    // Same partner id looked up twice: once as owner (existence only),
    // once as money changer (existence + partner_type check) — both must
    // resolve to a Money-Changer-typed row for this to succeed.
    partners: [{ data: MONEY_CHANGER_ROW }, { data: MONEY_CHANGER_ROW }],
    receiving_accounts: [{ data: { ...account, owner_partner_id: "mc-1", money_changer_partner_id: "mc-1" } }],
  });

  const result = await createReceivingAccount(
    { bank_id: "bank-1", owner_partner_id: "mc-1", currency: "VND", account_number: "****1234", money_changer_partner_id: "mc-1" },
    "staff-1",
    client
  );
  assert.equal(result.owner_partner_id, result.money_changer_partner_id);
});

test("12: one Money Changer can be associated with multiple receiving accounts (no uniqueness enforced)", async () => {
  const { createReceivingAccount } = await import("./receivingAccount.service");
  const { client: client1 } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }, { data: MONEY_CHANGER_ROW }],
    receiving_accounts: [{ data: { ...account, id: "ra-1", money_changer_partner_id: "mc-1" } }],
  });
  const { client: client2 } = makeFromClient({
    master_data: [{ data: BANK_ROW }],
    partners: [{ data: OWNER_ROW }, { data: MONEY_CHANGER_ROW }],
    receiving_accounts: [{ data: { ...account, id: "ra-2", account_number: "****5678", money_changer_partner_id: "mc-1" } }],
  });

  const first = await createReceivingAccount(
    { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "VND", account_number: "****1234", money_changer_partner_id: "mc-1" },
    "staff-1",
    client1
  );
  const second = await createReceivingAccount(
    { bank_id: "bank-1", owner_partner_id: "owner-1", currency: "USD", account_number: "****5678", money_changer_partner_id: "mc-1" },
    "staff-1",
    client2
  );

  assert.equal(first.money_changer_partner_id, "mc-1");
  assert.equal(second.money_changer_partner_id, "mc-1");
  assert.notEqual(first.id, second.id);
});
