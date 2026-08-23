import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Partner Compensation Pipeline verification (docs/14_SETTLEMENT_SPEC.md,
 * LOCKED Rev 4) — Product Owner directive, 2026-08-15. Covers: eligible
 * Compensation entering Settlement (Handed Off only, never Confirmed —
 * Decision 2), hand-off behavior, Settlement completion, duplicate
 * hand-off/settlement protection (Decision 5 — a Compensation belongs to at
 * most one Settlement Item system-wide), and invalid state transitions.
 *
 * lib/settlement/settlement.service.ts calls back into
 * lib/compensation/compensation.service.ts's own handOffCompensation() and
 * getCompensationById() — both real (not re-mocked), consistent with
 * "Settlement reuses Compensation's own function unchanged." Only
 * @/lib/supabase and @/lib/activityLog.service are stubbed, same reasoning
 * as compensation.service.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let logActivityCalls: any[][] = [];
mock.module("@/lib/activityLog.service", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  namedExports: { logActivity: async (...args: any[]) => { logActivityCalls.push(args); } },
});

/** Finance Project #1, Phase A — markSettlementPaid's own state-machine/
 * cascade logic lives entirely in the mark_settlement_paid() RPC (see
 * settlementPaidMigration.security.test.ts for its static verification and
 * the migration's own "Manual end-to-end check" for live Dev verification),
 * same convention order.service.test.ts already uses for
 * create_payment_with_ledger_sync. This suite only proves
 * settlement.service.ts's markSettlementPaid() threads its parameters to
 * the RPC correctly and surfaces an RPC error as SettlementRuleViolationError. */
let lastRpcCall: { name: string; args: Record<string, unknown> } | null = null;
let nextRpcResult: { data: unknown; error: unknown } = { data: null, error: null };

mock.module("@/lib/supabase/admin", {
  namedExports: {
    createAdminClient: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        lastRpcCall = { name, args };
        return Promise.resolve(nextRpcResult);
      },
    }),
  },
});

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

function makeClient(perTableSequence: Record<string, FakeResult[]>) {
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

function comp(overrides: Record<string, unknown> = {}) {
  return {
    id: "comp-1",
    compensation_code: "COMP-20260815-000001",
    partner_id: "partner-1",
    status: "Handed Off",
    calculated_amount: 100000,
    ...overrides,
  };
}

test("getEligibleCompensations: only Handed Off compensations not yet claimed by any Settlement Item are eligible", async () => {
  const { getEligibleCompensations } = await import("./settlement.service");
  const { client } = makeClient({
    settlement_items: [{ data: [{ compensation_id: "comp-claimed" }] }],
    compensations: [{ data: [comp({ id: "comp-claimed" }), comp({ id: "comp-free" })] }],
  });

  const eligible = await getEligibleCompensations(client);

  assert.equal(eligible.length, 1);
  assert.equal((eligible[0] as { id: string }).id, "comp-free");
});

test("getEligibleCompensations: Phase B — the claim check only counts ACTIVE Settlement Items (is_active=true)", async () => {
  const { getEligibleCompensations } = await import("./settlement.service");
  const { client, calls } = makeClient({
    settlement_items: [{ data: [] }],
    compensations: [{ data: [comp({ id: "comp-recovered" })] }],
  });

  await getEligibleCompensations(client);

  const eqCall = calls.find((c) => c.table === "settlement_items" && c.method === "eq");
  assert.deepEqual(eqCall!.args, ["is_active", true], "the claimed-compensation query must filter to active Settlement Items only");
});

test("getEligibleCompensations: Phase B — a Compensation whose only Settlement Item is deactivated (reverted by cancellation) is treated as unclaimed and reappears here once re-Handed-Off", async () => {
  const { getEligibleCompensations } = await import("./settlement.service");
  // Real Postgres would exclude the inactive row before returning — this
  // fixture represents exactly that post-filter result: the row for
  // comp-recovered's OLD (now-inactive) Settlement Item never appears.
  const { client } = makeClient({
    settlement_items: [{ data: [] }],
    compensations: [{ data: [comp({ id: "comp-recovered" })] }],
  });

  const eligible = await getEligibleCompensations(client);

  assert.equal(eligible.length, 1);
  assert.equal((eligible[0] as { id: string }).id, "comp-recovered");
});

test("createSettlement: accepts a Handed Off compensation and bundles it into a new Settlement Request", async () => {
  const { createSettlement } = await import("./settlement.service");
  const { client, calls } = makeClient({
    compensations: [{ data: comp() }],
    settlement_items: [{ data: [] }],
    settlements: [{ data: { id: "sett-1", settlement_code: "SETT-20260815-000001" } }],
  });

  await createSettlement(["comp-1"], "Bank Transfer", client);

  const insertCall = calls.find((c) => c.table === "settlements" && c.method === "insert");
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.partner_id, "partner-1");
  assert.equal(payload.status, "Draft");
});

test("createSettlement: rejects a Confirmed (not yet Handed Off) compensation — Decision 2, Confirmed is never selection-eligible", async () => {
  const { createSettlement, SettlementRuleViolationError } = await import("./settlement.service");
  const { client } = makeClient({
    compensations: [{ data: comp({ status: "Confirmed" }) }],
  });

  await assert.rejects(() => createSettlement(["comp-1"], "Bank Transfer", client), SettlementRuleViolationError);
});

test("createSettlement: duplicate settlement protection — rejects a compensation already claimed by another Settlement Item (Decision 5)", async () => {
  const { createSettlement, SettlementRuleViolationError } = await import("./settlement.service");
  const { client } = makeClient({
    compensations: [{ data: comp() }],
    settlement_items: [{ data: [{ compensation_id: "comp-1" }] }],
  });

  await assert.rejects(() => createSettlement(["comp-1"], "Bank Transfer", client), SettlementRuleViolationError);
});

test("createSettlement: Phase B — the duplicate-claim check only counts ACTIVE Settlement Items (is_active=true)", async () => {
  const { createSettlement } = await import("./settlement.service");
  const { client, calls } = makeClient({
    compensations: [{ data: comp() }],
    settlement_items: [{ data: [] }],
    settlements: [{ data: { id: "sett-1", settlement_code: "SETT-20260815-000001" } }],
  });

  await createSettlement(["comp-1"], "Bank Transfer", client);

  const eqCall = calls.find((c) => c.table === "settlement_items" && c.method === "eq");
  assert.deepEqual(eqCall!.args, ["is_active", true], "the duplicate-claim query must filter to active Settlement Items only");
});

test("createSettlement: Phase B — a Compensation recovered by Settlement Cancellation Reversal (re-Handed-Off, its old Settlement Item now inactive) can be bundled into a brand-new Settlement", async () => {
  const { createSettlement } = await import("./settlement.service");
  // Real Postgres, filtering `.eq('is_active', true)`, would return no
  // rows for a compensation whose only settlement_items row is now
  // inactive — this fixture represents exactly that post-filter result,
  // proving the new-Settlement path is not blocked by the old, reverted
  // claim.
  const { client, calls } = makeClient({
    compensations: [{ data: comp({ id: "comp-recovered", status: "Handed Off" }) }],
    settlement_items: [{ data: [] }],
    settlements: [{ data: { id: "sett-2", settlement_code: "SETT-20260821-000001" } }],
  });

  const settlement = await createSettlement(["comp-recovered"], "Bank Transfer", client);

  assert.equal(settlement.id, "sett-2");
  const itemsInsertCall = calls.find((c) => c.table === "settlement_items" && c.method === "insert");
  assert.deepEqual(itemsInsertCall!.args[0], [{ settlement_id: "sett-2", compensation_id: "comp-recovered" }]);
});

test("createSettlement: rejects bundling compensations from different Partners into one Settlement", async () => {
  const { createSettlement, SettlementRuleViolationError } = await import("./settlement.service");
  const { client } = makeClient({
    compensations: [{ data: comp({ id: "comp-1", partner_id: "partner-1" }) }, { data: comp({ id: "comp-2", partner_id: "partner-2" }) }],
    settlement_items: [{ data: [] }],
  });

  await assert.rejects(() => createSettlement(["comp-1", "comp-2"], "Bank Transfer", client), SettlementRuleViolationError);
});

test("submitSettlement: Draft -> Pending", async () => {
  const { submitSettlement } = await import("./settlement.service");
  const { client } = makeClient({
    settlements: [{ data: { id: "sett-1", status: "Draft", items: [] } }, { data: { id: "sett-1", status: "Pending", items: [] } }],
  });

  const result = await submitSettlement("sett-1", client);
  assert.equal(result.status, "Pending");
});

test("submitSettlement: invalid transition — rejects submitting a Settlement that isn't Draft", async () => {
  const { submitSettlement, SettlementRuleViolationError } = await import("./settlement.service");
  const { client } = makeClient({ settlements: [{ data: { id: "sett-1", status: "Pending", items: [] } }] });

  await assert.rejects(() => submitSettlement("sett-1", client), SettlementRuleViolationError);
});

test("approveSettlement: Pending -> Approved", async () => {
  const { approveSettlement } = await import("./settlement.service");
  const { client } = makeClient({
    settlements: [{ data: { id: "sett-1", status: "Pending", items: [] } }, { data: { id: "sett-1", status: "Approved", items: [] } }],
  });

  const result = await approveSettlement("sett-1", "staff-1", client);
  assert.equal(result.status, "Approved");
});

test("approveSettlement: passes its own client through to logActivity (BUG-002 Phase 2B-1 fix)", async () => {
  const { approveSettlement } = await import("./settlement.service");
  logActivityCalls = [];
  const { client } = makeClient({
    settlements: [{ data: { id: "sett-1", status: "Pending", items: [] } }, { data: { id: "sett-1", status: "Approved", items: [] } }],
  });

  await approveSettlement("sett-1", "staff-1", client);

  assert.equal(logActivityCalls.length, 1);
  const [, loggedClient] = logActivityCalls[0];
  assert.equal(loggedClient, client);
});

test("completeSettlement: Approved -> Completed (terminal)", async () => {
  const { completeSettlement } = await import("./settlement.service");
  const { client } = makeClient({
    settlements: [{ data: { id: "sett-1", status: "Approved", items: [] } }, { data: { id: "sett-1", status: "Completed", items: [] } }],
  });

  const result = await completeSettlement("sett-1", "staff-1", client);
  assert.equal(result.status, "Completed");
});

test("completeSettlement: already-settled protection — rejects completing a Settlement that isn't Approved (e.g. already Completed)", async () => {
  const { completeSettlement, SettlementRuleViolationError } = await import("./settlement.service");
  const { client } = makeClient({ settlements: [{ data: { id: "sett-1", status: "Completed", items: [] } }] });

  await assert.rejects(() => completeSettlement("sett-1", "staff-1", client), SettlementRuleViolationError);
});

// ============================================================
// Finance Project #1, Phase B — cancelSettlement() now calls
// cancel_settlement_with_reversal() via the service_role admin client,
// same convention as markSettlementPaid() (Phase A): the reversal
// cascade's own state-machine/atomicity/idempotency logic lives entirely
// in the RPC (see settlementCancellationReversalMigration.security.test.ts
// for its static verification and the migration's own "Manual end-to-end
// check"/"Manual idempotency check" for live Dev verification). This
// suite only proves settlement.service.ts's cancelSettlement() threads its
// parameters to the RPC correctly and surfaces an RPC error (e.g. a second
// cancel attempt on an already-Cancelled Settlement) as
// SettlementRuleViolationError, never as a silent success.
// ============================================================

test("cancelSettlement: threads staff id and settlement id to the cancel_settlement_with_reversal RPC", async () => {
  const { cancelSettlement } = await import("./settlement.service");
  const { client } = makeClient({
    settlements: [{ data: { id: "sett-1", status: "Cancelled", items: [] } }],
  });
  nextRpcResult = { data: { id: "sett-1", status: "Cancelled" }, error: null };

  const result = await cancelSettlement("sett-1", "staff-1", client);

  assert.equal(lastRpcCall!.name, "cancel_settlement_with_reversal");
  assert.deepEqual(lastRpcCall!.args, { p_staff_id: "staff-1", p_settlement_id: "sett-1" });
  assert.equal(result.status, "Cancelled");
});

test("cancelSettlement: double cancellation is rejected, not silently reprocessed — an RPC error (e.g. already Cancelled/Completed) surfaces as SettlementRuleViolationError", async () => {
  const { cancelSettlement, SettlementRuleViolationError } = await import("./settlement.service");
  const { client } = makeClient({ settlements: [] });
  nextRpcResult = {
    data: null,
    error: { message: 'Cannot cancel from status "Cancelled": only Draft/Pending/Approved settlements can be cancelled' },
  };

  await assert.rejects(() => cancelSettlement("sett-1", "staff-1", client), SettlementRuleViolationError);
});

test("markSettlementPaid: threads staff id, settlement id, payment reference, and receiving account id to the mark_settlement_paid RPC", async () => {
  const { markSettlementPaid } = await import("./settlement.service");
  const { client } = makeClient({
    settlements: [{ data: { id: "sett-1", status: "Paid", items: [] } }],
  });
  nextRpcResult = { data: { id: "sett-1", status: "Paid" }, error: null };

  const result = await markSettlementPaid("sett-1", "staff-1", "REF-001", "acct-1", client);

  assert.equal(lastRpcCall!.name, "mark_settlement_paid");
  assert.deepEqual(lastRpcCall!.args, {
    p_staff_id: "staff-1",
    p_settlement_id: "sett-1",
    p_payment_reference: "REF-001",
    p_receiving_account_id: "acct-1",
  });
  assert.equal(result.status, "Paid");
});

test("markSettlementPaid: surfaces an RPC error (e.g. not Completed, or missing settlement.manage) as SettlementRuleViolationError", async () => {
  const { markSettlementPaid, SettlementRuleViolationError } = await import("./settlement.service");
  const { client } = makeClient({ settlements: [] });
  nextRpcResult = { data: null, error: { message: 'Cannot mark as Paid from status "Draft": only Completed settlements can be marked Paid' } };

  await assert.rejects(() => markSettlementPaid("sett-1", "staff-1", "REF-001", "acct-1", client), SettlementRuleViolationError);
});

test("Settlement Total is always derived (SUM of Settlement Items' Compensation amounts), never independently entered", async () => {
  const { getSettlementById } = await import("./settlement.service");
  const items = [
    { id: "si-1", settlement_id: "sett-1", compensation_id: "comp-1", compensation: comp({ id: "comp-1", calculated_amount: 100000 }) },
    { id: "si-2", settlement_id: "sett-1", compensation_id: "comp-2", compensation: comp({ id: "comp-2", calculated_amount: 250000 }) },
  ];
  const { client } = makeClient({
    settlements: [{ data: { id: "sett-1", status: "Draft", items } }],
  });

  const settlement = await getSettlementById("sett-1", client);
  assert.equal(settlement!.total_amount, 350000);
});
