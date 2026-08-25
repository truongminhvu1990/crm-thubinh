import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { Order, OrderItem } from "@/types/order";

/**
 * Consignment Financial Record (D1/D2/D11/D04, LOCKED): Fee Base = Sale
 * Price (Order Item's line_total), Fee = Sale Price × 10%, Customer
 * Payable = Sale Price − Fee, one Financial Record per Consignment,
 * write-once, never routed through Compensation/Compensation Ledger/
 * Money & Debt Ledger. Runs entirely against an in-memory fake — no
 * DEV/local database connection.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

/** BUG-003 — createConsignmentFinancialRecordsForOrder's logActivity() call
 * must forward the same client it was itself given. */
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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: "ORD-00000001",
    customer_id: "customer-1",
    sales_owner: "Nguyen Van A",
    created_by: "Nguyen Van A",
    order_date: "2026-08-18",
    subtotal: 0,
    discount_total: 0,
    total_amount: 0,
    order_status: "Completed",
    payment_status: "Paid",
    ...overrides,
  } as Order;
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "item-1",
    order_id: "order-1",
    product_id: "product-1",
    snapshot_sale_price: 1000000,
    discount: 0,
    quantity: 1,
    line_total: 1000000,
    is_gift: false,
    ...overrides,
  };
}

test.beforeEach(() => {
  logActivityCalls = [];
});

test("createConsignmentFinancialRecordsForOrder: forwards its own client into logActivity, not the anon-defaulting default (BUG-003)", async () => {
  const { createConsignmentFinancialRecordsForOrder } = await import("./consignmentFinancialRecord.service");
  const { client } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "AVAILABLE_FOR_SALE" } }, { data: {} }, { data: { id: "cns-1", status: "SOLD" } }],
    consignment_financial_records: [{ data: { id: "cfr-1" } }],
  });

  await createConsignmentFinancialRecordsForOrder(makeOrder(), [makeItem()], client);

  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, client, "must be the exact client the function was given, not the module's own default");
});

test("createConsignmentFinancialRecordsForOrder: Fee = round(Sale Price × 10%), Customer Payable = Sale Price − Fee (D1/D2, LOCKED)", async () => {
  const { createConsignmentFinancialRecordsForOrder } = await import("./consignmentFinancialRecord.service");
  const { client, calls } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "AVAILABLE_FOR_SALE" } }, { data: {} }, { data: { id: "cns-1", status: "SOLD" } }],
    consignment_financial_records: [{ data: { id: "cfr-1" } }],
  });

  await createConsignmentFinancialRecordsForOrder(makeOrder(), [makeItem({ line_total: 1234567 })], client);

  const insertCall = calls.find((c) => c.table === "consignment_financial_records" && c.method === "insert");
  assert.ok(insertCall, "expected an insert() call against consignment_financial_records");
  const payload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(payload.sale_price, 1234567);
  assert.equal(payload.fee, Math.round(1234567 * 0.1));
  assert.equal(payload.customer_payable, 1234567 - Math.round(1234567 * 0.1));
});

test("createConsignmentFinancialRecordsForOrder: no active Consignment for the Product — creates nothing, never touches consignment_financial_records", async () => {
  const { createConsignmentFinancialRecordsForOrder } = await import("./consignmentFinancialRecord.service");
  const { client, calls } = makeClient({
    consignments: [{ data: null }],
  });

  await createConsignmentFinancialRecordsForOrder(makeOrder(), [makeItem()], client);

  assert.ok(
    !calls.some((c) => c.table === "consignment_financial_records"),
    "no Financial Record should be created when the Product has no active Consignment"
  );
});

test("createConsignmentFinancialRecordsForOrder: transitions the Consignment to SOLD after creating the record", async () => {
  const { createConsignmentFinancialRecordsForOrder } = await import("./consignmentFinancialRecord.service");
  const { client, calls } = makeClient({
    // Call order: [0] getActiveConsignmentByProductId, [1] getConsignmentById
    // inside markConsignmentSold (status re-checked), [2] the UPDATE itself,
    // [3] markConsignmentSold's own final re-fetch.
    consignments: [
      { data: { id: "cns-1", status: "RECEIVED" } },
      { data: { id: "cns-1", status: "RECEIVED" } },
      { data: {} },
      { data: { id: "cns-1", status: "SOLD" } },
    ],
    consignment_financial_records: [{ data: { id: "cfr-1" } }],
  });

  await createConsignmentFinancialRecordsForOrder(makeOrder(), [makeItem()], client);

  const soldUpdate = calls.find((c) => c.table === "consignments" && c.method === "update");
  assert.deepEqual(soldUpdate!.args[0], { status: "SOLD" });
});

test("createConsignmentFinancialRecordsForOrder: one order item per Product — best-effort, a per-item failure does not throw or block the caller (matches createCompensationsForOrder's own convention)", async () => {
  const { createConsignmentFinancialRecordsForOrder } = await import("./consignmentFinancialRecord.service");
  const { client } = makeClient({
    consignments: [{ data: { id: "cns-1", status: "AVAILABLE_FOR_SALE" } }],
    consignment_financial_records: [{ data: null, error: new Error("insert failed") }],
  });

  await assert.doesNotReject(() => createConsignmentFinancialRecordsForOrder(makeOrder(), [makeItem()], client));
});

test("createConsignmentFinancialRecordsForOrder: multiple items, only the consigned one produces a Financial Record", async () => {
  const { createConsignmentFinancialRecordsForOrder } = await import("./consignmentFinancialRecord.service");
  const { client, calls } = makeClient({
    consignments: [
      // item-1: no active consignment (1 call).
      { data: null },
      // item-2: [1] lookup, [2] getConsignmentById inside markConsignmentSold,
      // [3] the UPDATE, [4] final re-fetch.
      { data: { id: "cns-2", status: "AVAILABLE_FOR_SALE" } },
      { data: { id: "cns-2", status: "AVAILABLE_FOR_SALE" } },
      { data: {} },
      { data: { id: "cns-2", status: "SOLD" } },
    ],
    consignment_financial_records: [{ data: { id: "cfr-1" } }],
  });

  await createConsignmentFinancialRecordsForOrder(
    makeOrder(),
    [makeItem({ id: "item-1", product_id: "product-1" }), makeItem({ id: "item-2", product_id: "product-2" })],
    client
  );

  const inserts = calls.filter((c) => c.table === "consignment_financial_records" && c.method === "insert");
  assert.equal(inserts.length, 1, "exactly one Financial Record should be created, for the consigned item only");
});
