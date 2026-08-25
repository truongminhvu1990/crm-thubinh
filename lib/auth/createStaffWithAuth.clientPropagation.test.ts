import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * STAFF RLS BLOCKER fix — createStaffWithAuth()'s duplicate-email pre-check
 * called getStaffByEmail(email) with no client, always using the
 * module-level anon-fallback `supabase` client, even though this function
 * runs entirely server-side (no browser session for that client to attach
 * to) and already constructs a real admin (service_role) client for every
 * other operation it performs. Fixed by constructing that admin client
 * first and reusing it for the duplicate-email check too.
 *
 * `makeAdminClient` fakes just enough of the chain createStaffWithAuth
 * actually calls (`.auth.admin.createUser`, `.from("staff").insert()...`,
 * `.from("activity_logs").insert()`) to drive the happy path without any
 * real Supabase/network access. `getStaffByEmailCalls` records the exact
 * client instance getStaffByEmail was invoked with, so the fix can be
 * proven by identity (===), not just "some client was passed".
 */

function makeAdminClient(existingStaffId: string | null = null) {
  return {
    marker: "admin-service-role-client",
    auth: {
      admin: {
        createUser: async () => ({
          data: { user: { id: "auth-user-1" } },
          error: null,
        }),
        deleteUser: async () => ({ error: null }),
      },
    },
    from(table: string) {
      if (table === "staff") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: existingStaffId ?? "staff-new-1",
                  staff_code: "NV1",
                  full_name: "Nguyen Van A",
                  email: "new@example.com",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "activity_logs") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getStaffByEmailCalls: any[][] = [];
let getStaffByEmailResult: unknown = null;
let adminClientInstance: ReturnType<typeof makeAdminClient>;

mock.module("@/lib/supabase/admin", {
  namedExports: {
    createAdminClient: () => {
      adminClientInstance = makeAdminClient();
      return adminClientInstance;
    },
    AdminClientConfigError: class AdminClientConfigError extends Error {},
  },
});

mock.module("@/lib/staff.service", {
  namedExports: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getStaffByEmail: async (...args: any[]) => {
      getStaffByEmailCalls.push(args);
      return getStaffByEmailResult;
    },
  },
});

test.beforeEach(() => {
  getStaffByEmailCalls = [];
  getStaffByEmailResult = null;
});

test("createStaffWithAuth: the duplicate-email check uses the admin client, not the module-level anon default", async () => {
  const { createStaffWithAuth } = await import("./createStaffWithAuth");

  await createStaffWithAuth({
    staff_code: "NV1",
    full_name: "Nguyen Van A",
    email: "new@example.com",
    role: "Sales",
  });

  assert.equal(getStaffByEmailCalls.length, 1);
  const [email, client] = getStaffByEmailCalls[0];
  assert.equal(email, "new@example.com");
  assert.equal(client, adminClientInstance, "getStaffByEmail must receive the exact same admin client instance used for the rest of this function");
});

test("createStaffWithAuth: an existing staff row (found via the admin-client duplicate check) still rejects with EMAIL_DUPLICATE before any Auth user is created", async () => {
  const { createStaffWithAuth, CreateStaffWithAuthError } = await import("./createStaffWithAuth");
  getStaffByEmailResult = { id: "staff-existing-1", email: "dup@example.com" };

  await assert.rejects(
    () =>
      createStaffWithAuth({
        staff_code: "NV2",
        full_name: "Tran Thi B",
        email: "dup@example.com",
        role: "Sales",
      }),
    (error: unknown) => {
      assert.ok(error instanceof CreateStaffWithAuthError);
      assert.equal(error.code, "EMAIL_DUPLICATE");
      return true;
    }
  );

  // Duplicate check still ran through the admin client, exactly as the
  // happy-path test above asserts - this test's own focus is that a
  // positive result still blocks staff creation, same as before the fix.
  assert.equal(getStaffByEmailCalls.length, 1);
});
