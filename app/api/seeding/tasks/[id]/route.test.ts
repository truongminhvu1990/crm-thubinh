import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest } from "next/server";

/**
 * G2-CF (Issue 2), Product Owner Decision A (LOCKED) — PATCH
 * /api/seeding/tasks/[id] route-boundary coverage: a `comment_text`
 * body is a content-edit request, gated by seeding.manage alone
 * (never the execute-own-task path the status branch below still
 * uses), structurally unable to also carry a status change through.
 * The unassigned-only enforcement itself is covered at the service
 * layer (seedingTask.service.test.ts) — this file proves the route's
 * own authorization boundary and branch selection. Same mock.module()
 * convention as app/api/orders/route.test.ts (no real Supabase/DB
 * touched).
 */

let currentStaff: { id: string; full_name: string } | null = null;
let hasManagePermission = false;
let hasExecutePermission = false;
let currentTask: { id: string; assigned_staff_id: string | null } | null = null;
const updateTaskCommentTextCalls: unknown[][] = [];
const updateTaskStatusCalls: unknown[][] = [];

before(() => {
  mock.module("@/lib/permission/serverAuth", {
    namedExports: {
      getCurrentStaffFromRequest: async () => currentStaff,
    },
  });
  mock.module("@/lib/supabase/server", {
    namedExports: {
      createClient: async () => ({ id: "fake-client" }),
    },
  });
  mock.module("@/lib/permission/permissionCenter.service", {
    namedExports: {
      staffHasPermission: async (_staff: unknown, key: string) => {
        if (key === "seeding.manage") return hasManagePermission;
        if (key === "seeding.execute") return hasExecutePermission;
        return false;
      },
    },
  });
  mock.module("@/lib/seeding/seedingTask.service", {
    namedExports: {
      getTaskById: async () => currentTask,
      updateTaskCommentText: async (...args: unknown[]) => {
        updateTaskCommentTextCalls.push(args);
        return { id: "t1", comment_text: args[1] };
      },
      updateTaskStatus: async (...args: unknown[]) => {
        updateTaskStatusCalls.push(args);
        return { id: "t1", status: (args[1] as { status: string }).status };
      },
    },
  });
});

beforeEach(() => {
  currentStaff = null;
  hasManagePermission = false;
  hasExecutePermission = false;
  currentTask = null;
  updateTaskCommentTextCalls.length = 0;
  updateTaskStatusCalls.length = 0;
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/seeding/tasks/t1", { method: "PATCH", body: JSON.stringify(body) });
}

test("PATCH comment_text: unauthenticated is rejected with 401, never reaches updateTaskCommentText", async () => {
  const { PATCH } = await import("./route");
  const res = await PATCH(makeRequest({ comment_text: "Nội dung mới" }), { params: Promise.resolve({ id: "t1" }) });
  assert.equal(res.status, 401);
  assert.equal(updateTaskCommentTextCalls.length, 0);
});

test("PATCH comment_text: authenticated without seeding.manage (execute-only) is rejected with 403, even on an unassigned task", async () => {
  currentStaff = { id: "staff-1", full_name: "Execute Only" };
  hasExecutePermission = true;
  hasManagePermission = false;
  currentTask = { id: "t1", assigned_staff_id: null };

  const { PATCH } = await import("./route");
  const res = await PATCH(makeRequest({ comment_text: "Nội dung mới" }), { params: Promise.resolve({ id: "t1" }) });
  assert.equal(res.status, 403);
  assert.equal(updateTaskCommentTextCalls.length, 0);
});

test("PATCH comment_text: seeding.manage can edit — reaches updateTaskCommentText with the exact taskId and text", async () => {
  currentStaff = { id: "staff-manager", full_name: "Manager" };
  hasManagePermission = true;
  currentTask = { id: "t1", assigned_staff_id: null };

  const { PATCH } = await import("./route");
  const res = await PATCH(makeRequest({ comment_text: "Nội dung mới" }), { params: Promise.resolve({ id: "t1" }) });
  assert.equal(res.status, 200);
  assert.equal(updateTaskCommentTextCalls.length, 1);
  assert.equal(updateTaskCommentTextCalls[0][0], "t1");
  assert.equal(updateTaskCommentTextCalls[0][1], "Nội dung mới");
});

test("PATCH comment_text: a nonexistent task returns 404 before any authorization check result matters", async () => {
  currentStaff = { id: "staff-manager", full_name: "Manager" };
  hasManagePermission = true;
  currentTask = null;

  const { PATCH } = await import("./route");
  const res = await PATCH(makeRequest({ comment_text: "Nội dung mới" }), { params: Promise.resolve({ id: "t1" }) });
  assert.equal(res.status, 404);
  assert.equal(updateTaskCommentTextCalls.length, 0);
});

test("PATCH status (existing path, unaffected): execute-only staff can still update their own assigned task's status", async () => {
  currentStaff = { id: "staff-1", full_name: "Execute Only" };
  hasExecutePermission = true;
  hasManagePermission = false;
  currentTask = { id: "t1", assigned_staff_id: "staff-1" };

  const { PATCH } = await import("./route");
  const res = await PATCH(makeRequest({ status: "Done" }), { params: Promise.resolve({ id: "t1" }) });
  assert.equal(res.status, 200);
  assert.equal(updateTaskStatusCalls.length, 1);
  assert.equal(updateTaskCommentTextCalls.length, 0, "a status-only body must never reach updateTaskCommentText");
});
