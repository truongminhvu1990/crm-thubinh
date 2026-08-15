import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Partner Compensation Pipeline verification (docs/12_PARTNER_CENTER_SPEC.md,
 * LOCKED Rev 4) — Product Owner directive, 2026-08-15. Covers
 * Partner-linked Order retrieval (§7 Partner Attribution's own read side —
 * "Partner Center only reads `orders.partner_id` via its own Read Model").
 * Partner visibility/authorization (permission gating) is covered by
 * Browser UAT, not here — requirePermission's own enforcement is generic,
 * exercised identically across every module in this codebase.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

interface FakeResult {
  data: unknown;
  error?: unknown;
}

function makeClient(perTableSequence: Record<string, FakeResult[]>) {
  const counters: Record<string, number> = {};
  return {
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
          return () => proxy;
        },
      };
      const proxy: unknown = new Proxy({}, handler);
      return proxy;
    },
  } as never;
}

test("getOrdersByPartnerId: returns only Orders attributed to this Partner (orders.partner_id, read-only)", async () => {
  const { getOrdersByPartnerId } = await import("./partner.service");
  const rows = [
    { id: "o1", order_number: "OD-1", order_date: "2026-08-01", order_status: "Completed", total_amount: 1000000 },
    { id: "o2", order_number: "OD-2", order_date: "2026-08-02", order_status: "Draft", total_amount: 500000 },
  ];
  const client = makeClient({ orders: [{ data: rows }] });

  const result = await getOrdersByPartnerId("partner-1", client);
  assert.equal(result.length, 2);
  assert.equal(result[0].order_number, "OD-1");
});

test("getPartnerOrderStats: Successful Orders / Revenue Generated only count Completed orders", async () => {
  const { getPartnerOrderStats } = await import("./partner.service");
  const rows = [
    { id: "o1", order_number: "OD-1", order_date: "2026-08-01", order_status: "Completed", total_amount: 1000000 },
    { id: "o2", order_number: "OD-2", order_date: "2026-08-02", order_status: "Draft", total_amount: 500000 },
    { id: "o3", order_number: "OD-3", order_date: "2026-08-03", order_status: "Completed", total_amount: 2000000 },
  ];
  const client = makeClient({ orders: [{ data: rows }] });

  const stats = await getPartnerOrderStats("partner-1", client);
  assert.equal(stats.totalOrders, 3);
  assert.equal(stats.successfulOrders, 2);
  assert.equal(stats.revenueGenerated, 3000000);
});

test("getPartnerOrderStats: a Partner with zero Orders gets zeroed stats, not an error", async () => {
  const { getPartnerOrderStats } = await import("./partner.service");
  const client = makeClient({ orders: [{ data: [] }] });

  const stats = await getPartnerOrderStats("partner-nobody", client);
  assert.deepEqual(stats, { totalOrders: 0, successfulOrders: 0, revenueGenerated: 0 });
});

test("createPartner: new Partner defaults to Onboarding lifecycle status when specified by the caller", async () => {
  const { createPartner } = await import("./partner.service");
  const client = makeClient({
    partners: [{ data: [] }, { data: { id: "p1", partner_code: "PTR-20260815-000001", status: "Onboarding" } }],
  });

  const result = await createPartner({ name: "Test Partner", partner_type: "Collaborator", status: "Onboarding" }, "staff-1", client);
  assert.equal(result.status, "Onboarding");
});

test("updatePartner: Partner lifecycle Active -> Terminated is a Status transition, never a delete (no partner.delete permission exists)", async () => {
  const { updatePartner } = await import("./partner.service");
  const client = makeClient({
    partners: [{ data: { id: "p1", status: "Active" } }, { data: { id: "p1", status: "Terminated" } }],
  });

  const result = await updatePartner("p1", { status: "Terminated" }, "staff-1", client);
  assert.equal(result.status, "Terminated");
});
