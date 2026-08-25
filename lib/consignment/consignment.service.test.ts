import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Consignment domain entity + status transitions (D02/D01/D5, LOCKED).
 * Runs entirely against an in-memory fake Supabase client — no DEV/local
 * database connection, no network I/O. Mirrors the exact fake-client
 * pattern already established by
 * lib/compensation/compensation.service.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

/** BUG-003 — every logActivity() call in this file must forward the same
 * client it was itself given, not fall back to activityLog.service.ts's
 * own anon-defaulting default. Captured here (object identity) rather than
 * left as a no-op stub, so a regression is caught directly. */
let logActivityCalls: { entry: unknown; client: unknown }[] = [];
mock.module("@/lib/activityLog.service", {
  namedExports: {
    logActivity: async (entry: unknown, client: unknown) => {
      logActivityCalls.push({ entry, client });
    },
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

test.beforeEach(() => {
  logActivityCalls = [];
});

test("createConsignment/markConsignmentAvailable/returnConsignment/markConsignmentSold: each forwards its own client into logActivity, not the anon-defaulting default (BUG-003)", async () => {
  const { createConsignment, markConsignmentAvailable, returnConsignment, markConsignmentSold } = await import("./consignment.service");

  const { client: clientA } = makeClient({
    consignments: [{ data: [] }, { data: { id: "cns-1", status: "RECEIVED" } }],
  });
  await createConsignment({ customer_id: "customer-1", product_id: "product-1" }, "staff-1", clientA);
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, clientA, "createConsignment must forward its own client");

  logActivityCalls = [];
  const { client: clientB } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "RECEIVED" } }, { data: {} }, { data: { id: "cns-1", status: "AVAILABLE_FOR_SALE" } }],
  });
  await markConsignmentAvailable("cns-1", "staff-1", clientB);
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, clientB, "markConsignmentAvailable must forward its own client");

  logActivityCalls = [];
  const { client: clientC } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "RECEIVED" } }, { data: {} }, { data: { id: "cns-1", status: "RETURNED" } }],
  });
  await returnConsignment("cns-1", "staff-1", clientC);
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, clientC, "returnConsignment must forward its own client");

  logActivityCalls = [];
  const { client: clientD } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "RECEIVED" } }, { data: {} }, { data: { id: "cns-1", status: "SOLD" } }],
  });
  await markConsignmentSold("cns-1", clientD);
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, clientD, "markConsignmentSold must forward its own client");
});

test("createConsignment: creates with status RECEIVED, generates a CNS- code", async () => {
  const { createConsignment } = await import("./consignment.service");
  const { client, calls } = makeClient({
    consignments: [{ data: [] }, { data: { id: "cns-1", status: "RECEIVED" } }],
  });

  await createConsignment({ customer_id: "customer-1", product_id: "product-1" }, "staff-1", client);

  const insertCall = calls.find((c) => c.method === "insert");
  assert.ok(insertCall, "expected an insert() call against consignments");
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.status, "RECEIVED");
  assert.equal(payload.customer_id, "customer-1");
  assert.equal(payload.product_id, "product-1");
  assert.match(payload.consignment_code as string, /^CNS-\d{8}-\d{6}$/);
});

test("markConsignmentAvailable: RECEIVED -> AVAILABLE_FOR_SALE", async () => {
  const { markConsignmentAvailable } = await import("./consignment.service");
  const { client, calls } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "RECEIVED" } }, { data: {} }, { data: { id: "cns-1", status: "AVAILABLE_FOR_SALE" } }],
  });

  const result = await markConsignmentAvailable("cns-1", "staff-1", client);

  assert.equal(result.status, "AVAILABLE_FOR_SALE");
  const updateCall = calls.find((c) => c.method === "update");
  assert.deepEqual(updateCall!.args[0], { status: "AVAILABLE_FOR_SALE" });
});

test("markConsignmentAvailable: rejects from any status other than RECEIVED", async () => {
  const { markConsignmentAvailable, ConsignmentRuleViolationError } = await import("./consignment.service");
  const { client } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "SOLD" } }],
  });

  await assert.rejects(() => markConsignmentAvailable("cns-1", "staff-1", client), ConsignmentRuleViolationError);
});

test("returnConsignment: RECEIVED -> RETURNED (D5/D01 — return may occur before active listing)", async () => {
  const { returnConsignment } = await import("./consignment.service");
  const { client, calls } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "RECEIVED" } }, { data: {} }, { data: { id: "cns-1", status: "RETURNED" } }],
  });

  const result = await returnConsignment("cns-1", "staff-1", client);

  assert.equal(result.status, "RETURNED");
  const updateCall = calls.find((c) => c.method === "update");
  const payload = updateCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.status, "RETURNED");
  assert.ok(payload.returned_at, "returned_at must be stamped");
});

test("returnConsignment: AVAILABLE_FOR_SALE -> RETURNED", async () => {
  const { returnConsignment } = await import("./consignment.service");
  const { client } = makeClient({
    consignments: [
      { data: { id: "cns-1", status: "AVAILABLE_FOR_SALE" } },
      { data: {} },
      { data: { id: "cns-1", status: "RETURNED" } },
    ],
  });

  const result = await returnConsignment("cns-1", "staff-1", client);
  assert.equal(result.status, "RETURNED");
});

test("returnConsignment: rejects from SOLD (a completed sale is never reversed by an unsold-only Return)", async () => {
  const { returnConsignment, ConsignmentRuleViolationError } = await import("./consignment.service");
  const { client } = makeClient({ consignments: [{ data: { id: "cns-1", status: "SOLD" } }] });

  await assert.rejects(() => returnConsignment("cns-1", "staff-1", client), ConsignmentRuleViolationError);
});

test("returnConsignment: rejects from RETURNED (terminal, no re-return)", async () => {
  const { returnConsignment, ConsignmentRuleViolationError } = await import("./consignment.service");
  const { client } = makeClient({ consignments: [{ data: { id: "cns-1", status: "RETURNED" } }] });

  await assert.rejects(() => returnConsignment("cns-1", "staff-1", client), ConsignmentRuleViolationError);
});

test("markConsignmentSold: RECEIVED -> SOLD (lenient eligibility, flagged in code comment — not just AVAILABLE_FOR_SALE)", async () => {
  const { markConsignmentSold } = await import("./consignment.service");
  const { client, calls } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "RECEIVED" } }, { data: {} }, { data: { id: "cns-1", status: "SOLD" } }],
  });

  const result = await markConsignmentSold("cns-1", client);

  assert.equal(result?.status, "SOLD");
  const updateCall = calls.find((c) => c.method === "update");
  assert.deepEqual(updateCall!.args[0], { status: "SOLD" });
});

test("markConsignmentSold: AVAILABLE_FOR_SALE -> SOLD", async () => {
  const { markConsignmentSold } = await import("./consignment.service");
  const { client } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "AVAILABLE_FOR_SALE" } }, { data: {} }, { data: { id: "cns-1", status: "SOLD" } }],
  });

  const result = await markConsignmentSold("cns-1", client);
  assert.equal(result?.status, "SOLD");
});

test("markConsignmentSold: returns null (never throws) for an already-SOLD or RETURNED consignment", async () => {
  const { markConsignmentSold } = await import("./consignment.service");
  const { client, calls } = makeClient({ consignments: [{ data: { id: "cns-1", status: "RETURNED" } }] });

  const result = await markConsignmentSold("cns-1", client);

  assert.equal(result, null);
  assert.ok(!calls.some((c) => c.method === "update"), "must not write when already terminal");
});

test("markConsignmentSold: returns null for a nonexistent consignment, never throws", async () => {
  const { markConsignmentSold } = await import("./consignment.service");
  const { client } = makeClient({ consignments: [{ data: null }] });

  const result = await markConsignmentSold("missing", client);
  assert.equal(result, null);
});

test("getActiveConsignmentByProductId: filters to RECEIVED/AVAILABLE_FOR_SALE only", async () => {
  const { getActiveConsignmentByProductId } = await import("./consignment.service");
  const { client, calls } = makeClient({ consignments: [{ data: { id: "cns-1", status: "RECEIVED" } }] });

  await getActiveConsignmentByProductId("product-1", client);

  const inFilter = calls.find((c) => c.method === "in");
  assert.deepEqual(inFilter!.args, ["status", ["RECEIVED", "AVAILABLE_FOR_SALE"]]);
  const productFilter = calls.find((c) => c.method === "eq" && c.args[0] === "product_id");
  assert.deepEqual(productFilter!.args, ["product_id", "product-1"]);
});

test("getActiveConsignmentByProductId: returns null, never throws, when the query errors", async () => {
  const { getActiveConsignmentByProductId } = await import("./consignment.service");
  const { client } = makeClient({ consignments: [{ data: null, error: new Error("boom") }] });

  const result = await getActiveConsignmentByProductId("product-1", client);
  assert.equal(result, null);
});
