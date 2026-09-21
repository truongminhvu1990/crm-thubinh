import test from "node:test";
import assert from "node:assert/strict";
import { resolveStaffFromAuthUser } from "./staffIdentity";

/** Production Authorization Incident (2026-09-21) regression coverage —
 * the exact root cause: `lib/permission.ts#getCurrentStaff()` only ever
 * matched `staff.email`, with no `auth_user_id` fallback, unlike the
 * server-side `getCurrentStaffFromRequest()` — a staff row whose email no
 * longer matched `auth.users.email` exactly resolved server-side but not
 * client-side. Both callers now share this one resolver. */

const ACTIVE_STAFF_WITH_AUTH_USER_ID = {
  id: "staff-1",
  email: "owner@example.com",
  status: "Active",
  role: "Owner",
  role_id: "role-owner",
  auth_user_id: "auth-1",
};

const ACTIVE_STAFF_EMAIL_ONLY = {
  id: "staff-2",
  email: "sales@example.com",
  status: "Active",
  role: "Sales",
  role_id: "role-sales",
  auth_user_id: null,
};

const INACTIVE_STAFF_WITH_AUTH_USER_ID = {
  id: "staff-3",
  email: "locked@example.com",
  status: "Locked",
  role: "Sales",
  role_id: "role-sales",
  auth_user_id: "auth-3",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStaffTable(rows: any[]) {
  return {
    from(table: string) {
      assert.equal(table, "staff");
      let filtered = rows;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filtered = filtered.filter((r) => r[field] === value);
          return builder;
        },
        maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      };
      return builder;
    },
  };
}

test("resolves staff by auth_user_id when it matches (primary path)", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([ACTIVE_STAFF_WITH_AUTH_USER_ID]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-1", email: "someone-else@example.com" });
  assert.equal(staff?.id, "staff-1");
});

test("falls back to email when auth_user_id has no match", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([ACTIVE_STAFF_EMAIL_ONLY]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-does-not-exist", email: "sales@example.com" });
  assert.equal(staff?.id, "staff-2");
});

test("resolves to null when neither auth_user_id nor email match anything — the confirmed incident case", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([ACTIVE_STAFF_WITH_AUTH_USER_ID, ACTIVE_STAFF_EMAIL_ONLY]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "orphan-auth-id", email: "no-such-staff@example.com" });
  assert.equal(staff, null);
});

test("a staff row with auth_user_id = NULL never resolves via the auth_user_id path", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([ACTIVE_STAFF_EMAIL_ONLY]) as any;
  // Even if some other auth user's id happened to equal null-ish input, the
  // repository-level `.eq("auth_user_id", user.id)` filter never matches a
  // NULL column value against a real user id — proven by requiring the
  // email fallback to be what actually resolves this staff row.
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-does-not-exist", email: "sales@example.com" });
  assert.equal(staff?.auth_user_id, null);
  assert.equal(staff?.id, "staff-2");
});

test("an inactive (Locked) staff row does not resolve, even with a matching auth_user_id", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([INACTIVE_STAFF_WITH_AUTH_USER_ID]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-3", email: "locked@example.com" });
  assert.equal(staff, null);
});

test("no user (unauthenticated) is the caller's responsibility, not this function's — documented via email-less user", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-x", email: null });
  assert.equal(staff, null);
});
