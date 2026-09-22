import test from "node:test";
import assert from "node:assert/strict";
import { resolveStaffFromAuthUser } from "./staffIdentity";

/** Authorization identity-resolution hardening (2026-09-21) regression
 * coverage — the confirmed divergence: `lib/permission.ts#getCurrentStaff()`
 * only ever matched `staff.email`, with no `auth_user_id` fallback, unlike
 * the server-side `getCurrentStaffFromRequest()` — a staff row whose email
 * no longer matched `auth.users.email` exactly resolved server-side but not
 * client-side. Both callers now share this one resolver.
 *
 * This is NOT a fix for the original Production incident (root cause
 * remains UNCONFIRMED — see staffIdentity.ts's comment) and deliberately
 * does not filter on `staff.status`: an Inactive/Locked/Archived staff row
 * still resolves here exactly as both prior implementations already did.
 * Whether it should be rejected is a real, separately-tracked question
 * (Rule A/B, docs/PERMISSION_CENTER_INVESTIGATION_V2.md) — out of scope
 * for this change. */

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

const LOCKED_STAFF_WITH_AUTH_USER_ID = {
  id: "staff-3",
  email: "locked@example.com",
  status: "Locked",
  role: "Sales",
  role_id: "role-sales",
  auth_user_id: "auth-3",
};

const ARCHIVED_STAFF_EMAIL_ONLY = {
  id: "staff-4",
  email: "archived@example.com",
  status: "Archived",
  role: "Marketing",
  role_id: "role-marketing",
  auth_user_id: null,
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

test("resolves to null when neither auth_user_id nor email match anything", async () => {
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

test("a Locked staff row still resolves via auth_user_id — no status filtering, matching existing pre-change behavior", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([LOCKED_STAFF_WITH_AUTH_USER_ID]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-3", email: "locked@example.com" });
  assert.equal(staff?.id, "staff-3");
  assert.equal(staff?.status, "Locked");
});

test("an Archived staff row still resolves via email fallback — no status filtering, matching existing pre-change behavior", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([ARCHIVED_STAFF_EMAIL_ONLY]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-does-not-exist", email: "archived@example.com" });
  assert.equal(staff?.id, "staff-4");
  assert.equal(staff?.status, "Archived");
});

test("no user (unauthenticated) is the caller's responsibility, not this function's — documented via email-less user", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = makeStaffTable([]) as any;
  const staff = await resolveStaffFromAuthUser(client, { id: "auth-x", email: null });
  assert.equal(staff, null);
});
