import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Customer activity-log client propagation. `addCustomer`/`updateCustomer`
 * previously had no client parameter at all, always using the module-level
 * anon-fallback `supabase` singleton for both their own `customers` writes
 * and their `logActivity()` call. Adds the same `client: SupabaseClient =
 * supabase` parameter already established across the rest of this
 * codebase's client-propagation fixes, threaded into every internal call
 * including `logActivity`.
 */

const defaultSupabase = { marker: "module-level-default-supabase" };
mock.module("@/lib/supabase", { namedExports: { supabase: defaultSupabase } });
mock.module("@/lib/permission", { namedExports: { getCurrentStaff: async () => null } });
mock.module("@/lib/permission/dataScope", { namedExports: { applyDataScope: async (q: unknown) => ({ query: q }) } });

let logActivityCalls: { entry: unknown; client: unknown }[] = [];
mock.module("./activityLog.service", {
  namedExports: {
    logActivity: (entry: unknown, client: unknown) => {
      logActivityCalls.push({ entry, client });
      return Promise.resolve();
    },
  },
});

let customerService: typeof import("./customer.service");

before(async () => {
  customerService = await import("./customer.service");
});

test.beforeEach(() => {
  logActivityCalls = [];
});

/** Chain matching addCustomer's exact usage: .from().insert(...).select().single() */
function makeAddCustomerClient(marker: string) {
  return {
    marker,
    from() {
      return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "customer-1" }, error: null }) }) }) };
    },
  };
}

/** Chain matching updateCustomer's exact usage: both the .select().eq().maybeSingle()
 * lookup and the .update().eq().select().single() write. */
function makeUpdateCustomerClient(marker: string, previousAssignedStaffId: string | null = null) {
  return {
    marker,
    from() {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { assigned_staff_id: previousAssignedStaffId }, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "customer-1" }, error: null }) }) }) }),
      };
    },
  };
}

// Wire the mocked module-level `supabase` default to the same chain shapes,
// so the "no client supplied" tests below exercise the real default path
// without throwing.
Object.assign(defaultSupabase as Record<string, unknown>, {
  from() {
    return {
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "customer-1" }, error: null }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { assigned_staff_id: null }, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "customer-1" }, error: null }) }) }) }),
    };
  },
});

test("addCustomer: forwards its own client into logActivity, not the anon-defaulting default", async () => {
  const fakeClient = makeAddCustomerClient("client-A");

  await customerService.addCustomer({ full_name: "A", phone: "0900000001", assigned_staff_id: "staff-1" }, fakeClient as never);

  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, fakeClient, "must be the exact client addCustomer was given, not customer.service.ts's own default");
});

test("addCustomer: with no client argument, logActivity falls back to the module's own default (backward compatible)", async () => {
  await assert.doesNotReject(() => customerService.addCustomer({ full_name: "B", phone: "0900000002", assigned_staff_id: "staff-1" }));
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, defaultSupabase, "no client argument means addCustomer's own default (module-level supabase) is used, unchanged");
});

test("updateCustomer: forwards its own client into logActivity when assigned_staff_id changes, not the anon-defaulting default", async () => {
  const fakeClient = makeUpdateCustomerClient("client-B", null);

  await customerService.updateCustomer("customer-1", { assigned_staff_id: "staff-2" }, fakeClient as never);

  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, fakeClient, "must be the exact client updateCustomer was given, not customer.service.ts's own default");
});

test("updateCustomer: with no client argument, logActivity falls back to the module's own default (backward compatible)", async () => {
  await assert.doesNotReject(() => customerService.updateCustomer("customer-1", { assigned_staff_id: "staff-3" }));
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0].client, defaultSupabase, "no client argument means updateCustomer's own default (module-level supabase) is used, unchanged");
});
