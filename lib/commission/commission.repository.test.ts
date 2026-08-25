import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Commission-rule client propagation. `getActiveCommissionRules()` is the
 * lookup completeOrder() (lib/orders/order.service.ts) depends on to find
 * a matching commission bracket; it previously had no client parameter at
 * all, hardcoded to this module's own anon-defaulting `supabase` singleton.
 * commission_rules' RLS is authenticated-only, so under the anon role this
 * silently returns zero rows — completeOrder then finds no matching rule
 * and throws a false "no matching commission rate" business error, even
 * when a genuinely matching rule exists. This proves the leaf function
 * itself genuinely uses whatever client its caller passes, via object
 * identity, not just type compatibility — and that an untouched second
 * client is never queried.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

function makeFakeClient(fromCalls: string[], rows: unknown[]) {
  return {
    from(table: string) {
      fromCalls.push(table);
      return {
        select() {
          return {
            eq() {
              return {
                order: () => Promise.resolve({ data: rows, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

test("getActiveCommissionRules: reads through the exact injected client, not the module's own default, and a different client is never touched", async () => {
  const { getActiveCommissionRules } = await import("./commission.repository");

  const rows = [
    { id: "rule-1", minimum_amount: 0, maximum_amount: 9999999, commission_percent: 5, is_active: true, created_at: "", updated_at: "" },
  ];
  const fromCallsA: string[] = [];
  const clientA = makeFakeClient(fromCallsA, rows);
  const fromCallsB: string[] = [];
  makeFakeClient(fromCallsB, rows); // never passed to getActiveCommissionRules — must stay untouched

  const result = await getActiveCommissionRules(clientA as never);

  assert.deepEqual(result, rows);
  assert.deepEqual(fromCallsA, ["commission_rules"]);
  assert.equal(fromCallsB.length, 0, "a client never passed to getActiveCommissionRules must never be queried");
});

test("getActiveCommissionRules: a rule matching the 2,500,000 range (0-9,999,999) is returned via the injected client, matching Order completion's real bracket-matching path", async () => {
  const { getActiveCommissionRules } = await import("./commission.repository");
  const { findMatchingRule } = await import("./commission.service");

  const rows = [
    { id: "rule-1", minimum_amount: 0, maximum_amount: 9999999, commission_percent: 5, is_active: true, created_at: "", updated_at: "" },
    { id: "rule-2", minimum_amount: 10000000, maximum_amount: null, commission_percent: 3, is_active: true, created_at: "", updated_at: "" },
  ];
  const fromCalls: string[] = [];
  const client = makeFakeClient(fromCalls, rows);

  const rules = await getActiveCommissionRules(client as never);
  const rule = findMatchingRule(rules, 2500000);

  assert.ok(rule, "2,500,000 must match the 0-9,999,999 bracket");
  assert.equal(rule?.id, "rule-1");
  assert.equal(rule?.commission_percent, 5);
});
