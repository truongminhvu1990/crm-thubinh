import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * BUG-002 Phase 2D — Ops Console activity_logs client propagation.
 * opsConsole.service.ts had zero SupabaseClient support anywhere before
 * this fix; every read/write call fell through to
 * getActivityLogsByEntityType/logActivity's own module-level anon-fallback
 * default. Spies on both, rather than a fake Postgres client, since this
 * file's only DB interaction is through those two activityLog.service.ts
 * functions — proving they receive the right client is exactly proving
 * the fix, without needing to also fake activity_logs row shapes here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getActivityLogsByEntityTypeCalls: any[][] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let logActivityCalls: any[][] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getActivityLogsByEntityTypeResult: any[] = [];

mock.module("../activityLog.service", {
  namedExports: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getActivityLogsByEntityType: async (...args: any[]) => {
      getActivityLogsByEntityTypeCalls.push(args);
      return getActivityLogsByEntityTypeResult;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logActivity: async (...args: any[]) => {
      logActivityCalls.push(args);
    },
  },
});

beforeEach(() => {
  getActivityLogsByEntityTypeCalls = [];
  logActivityCalls = [];
  getActivityLogsByEntityTypeResult = [];
});

const fakeClient = { marker: "request-scoped-authenticated-client" };

// ============================================================
// Read functions — each should thread its client into
// getActivityLogsByEntityType as the 3rd argument.
// ============================================================

test("getReleaseChecklistState: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getReleaseChecklistState } = await import("./opsConsole.service");
  await getReleaseChecklistState(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [entity, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(entity, "release_checklist");
  assert.equal(client, fakeClient);
});

test("getGoLiveState: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getGoLiveState } = await import("./opsConsole.service");
  await getGoLiveState(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(client, fakeClient);
});

test("getUatProgressState: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getUatProgressState } = await import("./opsConsole.service");
  await getUatProgressState(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(client, fakeClient);
});

test("getDeploymentLog: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getDeploymentLog } = await import("./opsConsole.service");
  await getDeploymentLog(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(client, fakeClient);
});

test("getMigrationVerificationLog: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getMigrationVerificationLog } = await import("./opsConsole.service");
  await getMigrationVerificationLog(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(client, fakeClient);
});

test("getBackupConfirmationLog: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getBackupConfirmationLog } = await import("./opsConsole.service");
  await getBackupConfirmationLog(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(client, fakeClient);
});

test("getRestoreDrillLog: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getRestoreDrillLog } = await import("./opsConsole.service");
  await getRestoreDrillLog(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(client, fakeClient);
});

test("getMobileReadinessNotesState: threads the supplied client into getActivityLogsByEntityType", async () => {
  const { getMobileReadinessNotesState } = await import("./opsConsole.service");
  await getMobileReadinessNotesState(fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [entity, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(entity, "mobile_readiness_note");
  assert.equal(client, fakeClient);
});

// ============================================================
// Write functions — each should thread its client into logActivity, and
// (where applicable) into the internal findLatestForEntityId lookup too
// (which itself calls getActivityLogsByEntityType).
// ============================================================

test("toggleReleaseChecklistItem: threads the supplied client into logActivity", async () => {
  const { toggleReleaseChecklistItem } = await import("./opsConsole.service");
  await toggleReleaseChecklistItem("staff-1", "item-1", true, fakeClient as never);
  assert.equal(logActivityCalls.length, 1);
  const [, client] = logActivityCalls[0];
  assert.equal(client, fakeClient);
});

test("setGoLiveApproval: threads the supplied client into both the prior-state lookup and logActivity", async () => {
  const { setGoLiveApproval } = await import("./opsConsole.service");
  await setGoLiveApproval("staff-1", true, fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1, "prior-state lookup via findLatestForEntityId");
  assert.equal(getActivityLogsByEntityTypeCalls[0][2], fakeClient);
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0][1], fakeClient);
});

test("markUatItemVerified: threads the supplied client into both the prior-state lookup and logActivity", async () => {
  const { markUatItemVerified } = await import("./opsConsole.service");
  await markUatItemVerified("staff-1", "Owner", "item-1", true, fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls[0][2], fakeClient);
  assert.equal(logActivityCalls[0][1], fakeClient);
});

test("logDeployment: threads the supplied client into both the prior-state lookup and logActivity", async () => {
  const { logDeployment } = await import("./opsConsole.service");
  await logDeployment("staff-1", { environment: "production", version: "1.0.0" }, fakeClient as never);
  assert.equal(getActivityLogsByEntityTypeCalls[0][2], fakeClient);
  assert.equal(logActivityCalls[0][1], fakeClient);
});

test("logMigrationVerification: threads the supplied client into both the prior-state lookup and logActivity", async () => {
  const { logMigrationVerification } = await import("./opsConsole.service");
  await logMigrationVerification(
    "staff-1",
    {
      environment: "production",
      migrationFile: "20260101_test.sql",
      completed: true,
      recordCounts: true,
      constraints: true,
      appStartup: true,
    },
    fakeClient as never
  );
  assert.equal(getActivityLogsByEntityTypeCalls[0][2], fakeClient);
  assert.equal(logActivityCalls[0][1], fakeClient);
});

test("logBackupConfirmation: threads the supplied client into both the prior-state lookup and logActivity", async () => {
  const { logBackupConfirmation } = await import("./opsConsole.service");
  await logBackupConfirmation(
    "staff-1",
    { environment: "production", planTier: "Pro", pitrEnabled: true },
    fakeClient as never
  );
  assert.equal(getActivityLogsByEntityTypeCalls[0][2], fakeClient);
  assert.equal(logActivityCalls[0][1], fakeClient);
});

test("logRestoreDrill: threads the supplied client into both the prior-state lookup and logActivity", async () => {
  const { logRestoreDrill } = await import("./opsConsole.service");
  await logRestoreDrill(
    "staff-1",
    { environment: "production", backupReference: "bkp-1", restoreDuration: "5m", result: "success" },
    fakeClient as never
  );
  assert.equal(getActivityLogsByEntityTypeCalls[0][2], fakeClient);
  assert.equal(logActivityCalls[0][1], fakeClient);
});

test("updateMobileReadinessNote: threads the supplied client into logActivity", async () => {
  const { updateMobileReadinessNote } = await import("./opsConsole.service");
  await updateMobileReadinessNote("staff-1", "item-1", "some note", fakeClient as never);
  assert.equal(logActivityCalls.length, 1);
  assert.equal(logActivityCalls[0][1], fakeClient);
});

// ============================================================
// No-client fallback — existing behavior preserved: every function still
// works with no client argument, and passes `undefined` through rather
// than silently substituting something else (matching
// getActivityLogsByEntityType's/logActivity's own default-parameter
// fallback, unchanged by this fix).
// ============================================================

test("getReleaseChecklistState: with no client argument, still calls through (undefined client, existing default fallback applies downstream)", async () => {
  const { getReleaseChecklistState } = await import("./opsConsole.service");
  const result = await getReleaseChecklistState();
  assert.equal(getActivityLogsByEntityTypeCalls.length, 1);
  const [, , client] = getActivityLogsByEntityTypeCalls[0];
  assert.equal(client, undefined);
  assert.ok(result instanceof Map);
});

test("toggleReleaseChecklistItem: with no client argument, still logs (undefined client, existing default fallback applies downstream)", async () => {
  const { toggleReleaseChecklistItem } = await import("./opsConsole.service");
  await toggleReleaseChecklistItem("staff-1", "item-1", false);
  assert.equal(logActivityCalls.length, 1);
  const [, client] = logActivityCalls[0];
  assert.equal(client, undefined);
});

// ============================================================
// Existing behavior unchanged — business logic (previous/next label
// computation, status word selection) untouched by adding the client
// parameter.
// ============================================================

test("setGoLiveApproval: existing action-label business logic unchanged (approved -> 'approved — Trước: ... → Sau: Approved')", async () => {
  const { setGoLiveApproval } = await import("./opsConsole.service");
  getActivityLogsByEntityTypeResult = [
    { id: "1", staff_id: "s1", action: "approved — Trước: Pending → Sau: Approved", entity: "go_live", entity_id: "production_approval", created_at: "2026-01-01" },
  ];
  await setGoLiveApproval("staff-1", true, fakeClient as never);
  const [entry] = logActivityCalls[0];
  assert.equal(entry.action, "approved — Trước: Approved → Sau: Approved");
  assert.equal(entry.entity_id, "production_approval");
});

test("markUatItemVerified: existing entity_id composition unchanged (role:itemKey)", async () => {
  const { markUatItemVerified } = await import("./opsConsole.service");
  await markUatItemVerified("staff-1", "Sales", "uat-item-2", true, fakeClient as never);
  const [entry] = logActivityCalls[0];
  assert.equal(entry.entity_id, "Sales:uat-item-2");
  assert.equal(entry.action, "verified — Trước: Chưa xác minh → Sau: Đã xác minh");
});
