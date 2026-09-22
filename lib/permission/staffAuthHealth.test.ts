import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/** Diagnostic-only staff <-> auth.users identity-link health check
 * (Production Authorization Incident, 2026-09-21). Fakes just enough of
 * the admin client's `auth.admin.listUsers` and the regular client's
 * `staff` table to drive every counted case without real network access.
 * Counts only — never asserts on raw email/id values leaking into the
 * result shape, matching the module's "aggregate counts only" contract. */

class FakeAdminClientConfigError extends Error {}

let adminUsers: { id: string; email: string | null }[] = [];
let adminConfigured = true;

mock.module("@/lib/supabase/admin", {
  namedExports: {
    createAdminClient: () => {
      if (!adminConfigured) throw new FakeAdminClientConfigError();
      return {
        auth: {
          admin: {
            listUsers: async ({ page }: { page: number; perPage: number }) => {
              if (page > 1) return { data: { users: [] }, error: null };
              return { data: { users: adminUsers }, error: null };
            },
          },
        },
      };
    },
    AdminClientConfigError: FakeAdminClientConfigError,
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(staffRows: any[]) {
  return {
    from(table: string) {
      assert.equal(table, "staff");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          assert.equal(field, "status");
          assert.equal(value, "Active");
          return { data: staffRows, error: null };
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test.beforeEach(() => {
  adminUsers = [];
  adminConfigured = true;
});

test("returns configured: false without querying anything when the service-role key isn't provisioned", async () => {
  adminConfigured = false;
  const { getStaffAuthHealthSummary } = await import("./staffAuthHealth");
  const result = await getStaffAuthHealthSummary(makeClient([{ auth_user_id: null, email: "x@example.com" }]));
  assert.deepEqual(result, {
    configured: false,
    totalActiveStaff: 0,
    missingAuthUserId: 0,
    authUserIdOrphaned: 0,
    emailUnmatched: 0,
    unresolvable: 0,
  });
});

test("counts a healthy staff row (auth_user_id resolves, email matches) as fully resolvable", async () => {
  adminUsers = [{ id: "auth-1", email: "owner@example.com" }];
  const { getStaffAuthHealthSummary } = await import("./staffAuthHealth");
  const result = await getStaffAuthHealthSummary(
    makeClient([{ auth_user_id: "auth-1", email: "owner@example.com" }])
  );
  assert.equal(result.configured, true);
  assert.equal(result.totalActiveStaff, 1);
  assert.equal(result.missingAuthUserId, 0);
  assert.equal(result.authUserIdOrphaned, 0);
  assert.equal(result.emailUnmatched, 0);
  assert.equal(result.unresolvable, 0);
});

test("counts the confirmed incident shape — auth_user_id NULL and email matching no auth.users row — as unresolvable", async () => {
  adminUsers = [{ id: "auth-1", email: "owner@example.com" }];
  const { getStaffAuthHealthSummary } = await import("./staffAuthHealth");
  const result = await getStaffAuthHealthSummary(
    makeClient([{ auth_user_id: null, email: "orphaned-owner@example.com" }])
  );
  assert.equal(result.missingAuthUserId, 1);
  assert.equal(result.emailUnmatched, 1);
  assert.equal(result.unresolvable, 1);
});

test("counts an orphaned auth_user_id (set, but no matching auth.users row) separately from a missing one", async () => {
  adminUsers = [];
  const { getStaffAuthHealthSummary } = await import("./staffAuthHealth");
  const result = await getStaffAuthHealthSummary(
    makeClient([{ auth_user_id: "auth-deleted", email: "no-match@example.com" }])
  );
  assert.equal(result.missingAuthUserId, 0);
  assert.equal(result.authUserIdOrphaned, 1);
  assert.equal(result.unresolvable, 1);
});

test("a resolvable auth_user_id with a merely stale email is not counted as unresolvable", async () => {
  adminUsers = [{ id: "auth-1", email: "new-login-email@example.com" }];
  const { getStaffAuthHealthSummary } = await import("./staffAuthHealth");
  const result = await getStaffAuthHealthSummary(
    makeClient([{ auth_user_id: "auth-1", email: "old-staff-email@example.com" }])
  );
  assert.equal(result.authUserIdOrphaned, 0);
  assert.equal(result.emailUnmatched, 1, "still flagged as a data-quality signal");
  assert.equal(result.unresolvable, 0, "auth_user_id alone already resolves this staff member");
});
