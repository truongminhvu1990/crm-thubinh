import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * BUG-003 — activity_logs client propagation. `logActivity()` is the
 * single write path activity_logs' RLS narrowing depends on; it previously
 * had no client parameter at all, hardcoded to this module's own
 * anon-defaulting `supabase` singleton. This proves the leaf function
 * itself genuinely uses whatever client its caller passes, via object
 * identity, not just type compatibility.
 */

const fakeClient = {
  from(table: string) {
    calls.push({ table, client: fakeClient });
    return {
      insert: async () => ({ error: null }),
    };
  },
};
const calls: { table: string; client: unknown }[] = [];

mock.module("./supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", { namedExports: { applyActivityLogScope: async (q: unknown) => ({ query: q }) } });

test("logActivity writes through the exact injected client, not the module's own default", async () => {
  calls.length = 0;
  const { logActivity } = await import("./activityLog.service");
  await logActivity({ staff_id: "staff-1", action: "test_action", entity: "test_entity", entity_id: "id-1" }, fakeClient as never);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "activity_logs");
  assert.equal(calls[0].client, fakeClient);
});
