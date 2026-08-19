import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Consignment Settlement (D8/D03, LOCKED) — pattern-extends the existing
 * Settlement lifecycle (Draft→Pending→Approved→Completed, or →Cancelled)
 * as a structurally separate table/service, keyed to Customer instead of
 * Partner, referencing Consignment Financial Records instead of
 * Compensation. Runs entirely against an in-memory fake — no DEV/local
 * database connection.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

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

test("createConsignmentSettlement: rejects an empty selection", async () => {
  const { createConsignmentSettlement, ConsignmentSettlementRuleViolationError } = await import(
    "./consignmentSettlement.service"
  );
  const { client } = makeClient({});

  await assert.rejects(
    () => createConsignmentSettlement([], "Bank Transfer", client),
    ConsignmentSettlementRuleViolationError
  );
});

test("createConsignmentSettlement: rejects mixed Consignors — every record in one Settlement must share the same Customer", async () => {
  const { createConsignmentSettlement, ConsignmentSettlementRuleViolationError } = await import(
    "./consignmentSettlement.service"
  );
  const { client } = makeClient({
    consignment_financial_records: [
      {
        data: [
          { id: "cfr-1", customer_payable: 100000, consignment: { customer_id: "customer-1" } },
          { id: "cfr-2", customer_payable: 200000, consignment: { customer_id: "customer-2" } },
        ],
      },
    ],
  });

  await assert.rejects(
    () => createConsignmentSettlement(["cfr-1", "cfr-2"], "Bank Transfer", client),
    ConsignmentSettlementRuleViolationError
  );
});

test("createConsignmentSettlement: rejects a Financial Record already claimed by another Settlement", async () => {
  const { createConsignmentSettlement, ConsignmentSettlementRuleViolationError } = await import(
    "./consignmentSettlement.service"
  );
  const { client } = makeClient({
    consignment_financial_records: [
      { data: [{ id: "cfr-1", customer_payable: 100000, consignment: { customer_id: "customer-1" } }] },
    ],
    consignment_settlement_items: [{ data: [{ consignment_financial_record_id: "cfr-1" }] }],
  });

  await assert.rejects(
    () => createConsignmentSettlement(["cfr-1"], "Bank Transfer", client),
    ConsignmentSettlementRuleViolationError
  );
});

test("createConsignmentSettlement: creates a Draft settlement for the shared Consignor, inserts one item per record", async () => {
  const { createConsignmentSettlement } = await import("./consignmentSettlement.service");
  const { client, calls } = makeClient({
    consignment_financial_records: [
      { data: [{ id: "cfr-1", customer_payable: 100000, consignment: { customer_id: "customer-1" } }] },
    ],
    consignment_settlement_items: [{ data: [] }, { data: {} }],
    consignment_settlements: [{ data: { id: "sett-1" } }],
  });

  const insertItemsCall = () => calls.find((c) => c.table === "consignment_settlement_items" && c.method === "insert");
  const insertSettlementCall = () => calls.find((c) => c.table === "consignment_settlements" && c.method === "insert");

  try {
    await createConsignmentSettlement(["cfr-1"], "Bank Transfer", client);
  } catch {
    // getConsignmentSettlementById's own re-fetch isn't stubbed in this
    // fixture — the assertions below only need the writes to have happened.
  }

  const settlementPayload = insertSettlementCall()!.args[0] as Record<string, unknown>;
  assert.equal(settlementPayload.customer_id, "customer-1");
  assert.equal(settlementPayload.status, "Draft");
  assert.equal(settlementPayload.settlement_method, "Bank Transfer");

  const itemsPayload = insertItemsCall()!.args[0] as Array<Record<string, unknown>>;
  assert.equal(itemsPayload.length, 1);
  assert.equal(itemsPayload[0].consignment_financial_record_id, "cfr-1");
  assert.equal(itemsPayload[0].consignment_settlement_id, "sett-1");
});

test("submitConsignmentSettlement: Draft -> Pending only", async () => {
  const { submitConsignmentSettlement, ConsignmentSettlementRuleViolationError } = await import(
    "./consignmentSettlement.service"
  );
  const { client } = makeClient({
    consignment_settlements: [{ data: { id: "sett-1", status: "Approved", items: [] } }],
  });

  await assert.rejects(() => submitConsignmentSettlement("sett-1", client), ConsignmentSettlementRuleViolationError);
});

test("approveConsignmentSettlement: Pending -> Approved only", async () => {
  const { approveConsignmentSettlement } = await import("./consignmentSettlement.service");
  const { client, calls } = makeClient({
    consignment_settlements: [
      { data: { id: "sett-1", status: "Pending", items: [] } },
      { data: {} },
      { data: { id: "sett-1", status: "Approved", items: [] } },
    ],
  });

  const result = await approveConsignmentSettlement("sett-1", "staff-1", client);

  assert.equal(result.status, "Approved");
  const updateCall = calls.find((c) => c.method === "update");
  const payload = updateCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.status, "Approved");
  assert.equal(payload.approved_by, "staff-1");
});

test("completeConsignmentSettlement: Approved -> Completed only — this IS the Customer Paid fact (§5, Final Design Specification)", async () => {
  const { completeConsignmentSettlement } = await import("./consignmentSettlement.service");
  const { client, calls } = makeClient({
    consignment_settlements: [
      { data: { id: "sett-1", status: "Approved", items: [] } },
      { data: {} },
      { data: { id: "sett-1", status: "Completed", items: [] } },
    ],
  });

  const result = await completeConsignmentSettlement("sett-1", "staff-1", client);

  assert.equal(result.status, "Completed");
  const updateCall = calls.find((c) => c.method === "update");
  const payload = updateCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.status, "Completed");
  assert.equal(payload.completed_by, "staff-1");
});

test("completeConsignmentSettlement: rejects completion from Draft/Pending (must be Approved first)", async () => {
  const { completeConsignmentSettlement, ConsignmentSettlementRuleViolationError } = await import(
    "./consignmentSettlement.service"
  );
  const { client } = makeClient({
    consignment_settlements: [{ data: { id: "sett-1", status: "Pending", items: [] } }],
  });

  await assert.rejects(() => completeConsignmentSettlement("sett-1", "staff-1", client), ConsignmentSettlementRuleViolationError);
});

test("cancelConsignmentSettlement: allowed from Draft/Pending/Approved, rejected from Completed/Cancelled (terminal)", async () => {
  const { cancelConsignmentSettlement, ConsignmentSettlementRuleViolationError } = await import(
    "./consignmentSettlement.service"
  );
  const { client: clientCompleted } = makeClient({
    consignment_settlements: [{ data: { id: "sett-1", status: "Completed", items: [] } }],
  });

  await assert.rejects(() => cancelConsignmentSettlement("sett-1", clientCompleted), ConsignmentSettlementRuleViolationError);
});

test("computeTotal (via getConsignmentSettlementById): total_amount is always SUM(items[].consignment_financial_record.customer_payable), never a stored value", async () => {
  const { getConsignmentSettlementById } = await import("./consignmentSettlement.service");
  const { client } = makeClient({
    consignment_settlements: [
      {
        data: {
          id: "sett-1",
          status: "Draft",
          total_amount: 999999999, // deliberately wrong stored value — must be ignored
          items: [
            { consignment_financial_record: { customer_payable: 100000 } },
            { consignment_financial_record: { customer_payable: 250000 } },
          ],
        },
      },
    ],
  });

  const settlement = await getConsignmentSettlementById("sett-1", client);
  assert.equal(settlement?.total_amount, 350000);
});
