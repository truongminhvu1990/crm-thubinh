import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import type { NextRequest } from "next/server";

/**
 * D12 Order Cancellation, Test 8 — unauthorized user cannot Cancel.
 * Decision B (LOCKED): Owner/Manager only, Sales explicitly excluded.
 *
 * mock.module() called once at file scope, mutable state per test — same
 * documented reasoning as order.repository.completeOrder.test.ts.
 */
let staffResult: { id: string; full_name: string } | null = { id: "staff-1", full_name: "Owner Test" };
let roleResult: { role_key: string } | null = { role_key: "Owner" };

mock.module("@/lib/permission/serverAuth", {
  namedExports: {
    getCurrentStaffFromRequest: async () => staffResult,
    // Authorization Resolution Client Propagation (2026-08-23) - the real
    // createRequestClient builds a cookie-authenticated Supabase client;
    // resolveRoleForStaff is itself mocked below and ignores its client
    // argument entirely, so a dummy value is sufficient here.
    createRequestClient: () => ({}),
  },
});
mock.module("@/lib/permission/permissionCenter.service", {
  namedExports: {
    resolveRoleForStaff: async () => roleResult,
    staffHasPermission: async () => true,
  },
});
mock.module("@/lib/permission/permissionCenter.repository", {
  namedExports: {
    getStaffByTeam: async () => [],
  },
});

test.beforeEach(() => {
  staffResult = { id: "staff-1", full_name: "Owner Test" };
  roleResult = { role_key: "Owner" };
});

test("authorizeOrderCancellation: Owner is authorized", async () => {
  roleResult = { role_key: "Owner" };
  const { authorizeOrderCancellation } = await import("./_authorization");
  const result = await authorizeOrderCancellation({} as NextRequest);
  assert.ok("staff" in result);
});

test("authorizeOrderCancellation: Manager is authorized", async () => {
  roleResult = { role_key: "Manager" };
  const { authorizeOrderCancellation } = await import("./_authorization");
  const result = await authorizeOrderCancellation({} as NextRequest);
  assert.ok("staff" in result);
});

test("Test 8: authorizeOrderCancellation: Sales is Forbidden (403)", async () => {
  roleResult = { role_key: "Sales" };
  const { authorizeOrderCancellation } = await import("./_authorization");
  const result = await authorizeOrderCancellation({} as NextRequest);
  assert.ok("error" in result);
  if ("error" in result) assert.equal(result.error.status, 403);
});

test("Test 8: authorizeOrderCancellation: unresolvable role is Forbidden (default-deny)", async () => {
  roleResult = null;
  const { authorizeOrderCancellation } = await import("./_authorization");
  const result = await authorizeOrderCancellation({} as NextRequest);
  assert.ok("error" in result);
});

test("Test 8: authorizeOrderCancellation: unauthenticated is Unauthorized (401)", async () => {
  staffResult = null;
  const { authorizeOrderCancellation } = await import("./_authorization");
  const result = await authorizeOrderCancellation({} as NextRequest);
  assert.ok("error" in result);
  if ("error" in result) assert.equal(result.error.status, 401);
});
