import { ActivityLog } from "@/types/activityLog";
import { getActivityLogsByEntityType } from "../activityLog.service";
import { logActivity } from "../activityLog.service";
import {
  RELEASE_CHECKLIST,
  CHECKLIST_TIER_WEIGHT,
  ChecklistTier,
  Dimension,
  DIMENSIONS,
  OPS_ACTIVITY_ENTITY,
} from "./opsConsole.constants";

/** Every operational tracker in the Ops Console reuses activity_logs
 * (Requirements: "Reuse existing Activity Log") instead of new tables -
 * PRODUCTION_READINESS_DATABASE.md left Backup Metadata/Restore Drill/UAT
 * Progress persistence as an open, undecided question rather than
 * authorizing new schema; this is the zero-new-schema implementation of
 * that document's own "Option A" framing, generalized to every tracker
 * this sprint needs, not just backup/restore.
 *
 * Each tracker's "current state" is simply its most recent log row per
 * entity_id - since activity_logs is append-only and already ordered by
 * created_at desc, "latest per key" is a client-side reduction over an
 * already-sorted list, not a new query shape. */
export function latestPerEntityId(logs: ActivityLog[]): Map<string, ActivityLog> {
  const latest = new Map<string, ActivityLog>();
  for (const log of logs) {
    if (!log.entity_id) continue;
    if (!latest.has(log.entity_id)) latest.set(log.entity_id, log);
  }
  return latest;
}

// ============================================================
// Standardized Activity Log payload (Decision 38) - every operational
// change in the 6 classified categories (Decision 36) records Operator
// and Timestamp via activity_logs' own existing staff_id/created_at
// columns (already true of every logActivity() call, nothing to add),
// plus Previous value and New value, which activity_logs has no dedicated
// column for - encoded in `action` using one consistent template, so
// every category's history reads the same way instead of ad hoc prose.
// ============================================================

function formatChange(previous: string, next: string): string {
  return `Trước: ${previous} → Sau: ${next}`;
}

/** Recovers just the "New value" half of a previous log's action, so
 * "previous" never accumulates nested "Trước: (Trước: ... → Sau: ...) →
 * Sau: ..." strings across many changes - only ever one level of history
 * is shown as context, matching how every other list in this Ops Console
 * already only shows the latest state, not a full diff chain. */
function extractNewValue(previousAction?: string): string {
  if (!previousAction) return "Chưa có";
  const match = previousAction.match(/Sau: (.+)$/);
  return match ? match[1] : previousAction;
}

async function findLatestForEntityId(entity: string, entityId: string): Promise<ActivityLog | undefined> {
  const logs = await getActivityLogsByEntityType(entity);
  return logs.find((l) => l.entity_id === entityId);
}

export async function getReleaseChecklistState(): Promise<Map<string, ActivityLog>> {
  const logs = await getActivityLogsByEntityType("release_checklist");
  return latestPerEntityId(logs);
}

export async function toggleReleaseChecklistItem(actorStaffId: string, itemKey: string, checked: boolean) {
  await logActivity({
    staff_id: actorStaffId,
    action: checked ? "checked" : "unchecked",
    entity: "release_checklist",
    entity_id: itemKey,
  });
}

export interface DimensionStatus {
  dimension: Dimension;
  status: "red" | "amber" | "green" | "unknown";
}

/** Production Dashboard's per-dimension tiles (Decision 22/UI §1) - status
 * derived directly from Release Checklist state, no separate judgment. */
export function computeDimensionStatuses(checklistState: Map<string, ActivityLog>): DimensionStatus[] {
  return DIMENSIONS.map((dimension) => {
    const itemsForDimension = RELEASE_CHECKLIST.filter((i) => i.dimension === dimension);
    if (itemsForDimension.length === 0) return { dimension, status: "unknown" as const };

    const resolved = itemsForDimension.filter((i) => checklistState.has(i.key));
    if (resolved.length === 0) return { dimension, status: "unknown" as const };

    const openCritical = itemsForDimension.some(
      (i) => i.tier === "critical" && checklistState.get(i.key)?.action !== "checked"
    );
    if (openCritical) return { dimension, status: "red" as const };

    const openHigh = itemsForDimension.some(
      (i) => i.tier === "high" && checklistState.get(i.key)?.action !== "checked"
    );
    if (openHigh) return { dimension, status: "amber" as const };

    return { dimension, status: "green" as const };
  });
}

export interface ReadinessScore {
  percent: number;
  qualifier: "ready" | "nearly_ready" | "not_ready";
  qualifierLabel: string;
  /** Decision 37 - when this score was computed. The score is always
   * computed fresh from live checklist state (never cached), so this is
   * simply the moment computeReadinessScore() ran, not a stored value. */
  calculatedAt: string;
}

/** Production Readiness Score (Decision 31) - weighted by tier
 * (Critical=3/High=2/Low=1), computed strictly from Release Checklist
 * state - no second, independently-invented metric. */
export function computeReadinessScore(checklistState: Map<string, ActivityLog>): ReadinessScore {
  let earned = 0;
  let possible = 0;
  let anyCriticalOpen = false;
  let anyItemUnresolved = false;

  for (const item of RELEASE_CHECKLIST) {
    const weight = CHECKLIST_TIER_WEIGHT[item.tier as ChecklistTier];
    possible += weight;
    const log = checklistState.get(item.key);
    const isChecked = log?.action === "checked";
    if (isChecked) earned += weight;
    if (!log) anyItemUnresolved = true;
    if (item.tier === "critical" && !isChecked) anyCriticalOpen = true;
  }

  const percent = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  const calculatedAt = new Date().toISOString();

  if (anyCriticalOpen) {
    return { percent, qualifier: "not_ready", qualifierLabel: "Chưa sẵn sàng", calculatedAt };
  }
  if (percent === 100 && !anyItemUnresolved) {
    return { percent, qualifier: "ready", qualifierLabel: "Sẵn sàng", calculatedAt };
  }
  return { percent, qualifier: "nearly_ready", qualifierLabel: "Gần sẵn sàng — còn hạng mục High/Low", calculatedAt };
}

// ============================================================
// Go Live (§13, Decision 34 - Product Owner Approval)
// ============================================================

export async function getGoLiveState(): Promise<Map<string, ActivityLog>> {
  const logs = await getActivityLogsByEntityType(OPS_ACTIVITY_ENTITY.GO_LIVE);
  return latestPerEntityId(logs);
}

export async function setGoLiveApproval(actorStaffId: string, approved: boolean) {
  const prior = await findLatestForEntityId(OPS_ACTIVITY_ENTITY.GO_LIVE, "production_approval");
  const previousLabel = prior ? extractNewValue(prior.action) : "Pending";
  const nextLabel = approved ? "Approved" : "Pending";
  const statusWord = approved ? "approved" : "pending";

  await logActivity({
    staff_id: actorStaffId,
    action: `${statusWord} — ${formatChange(previousLabel, nextLabel)}`,
    entity: OPS_ACTIVITY_ENTITY.GO_LIVE,
    entity_id: "production_approval",
  });
}

export function isGoLiveApproved(state: Map<string, ActivityLog>): boolean {
  return !!state.get("production_approval")?.action.startsWith("approved");
}

// ============================================================
// UAT Progress (§14.1)
// ============================================================

export async function getUatProgressState(): Promise<Map<string, ActivityLog>> {
  const logs = await getActivityLogsByEntityType(OPS_ACTIVITY_ENTITY.UAT);
  return latestPerEntityId(logs);
}

export async function markUatItemVerified(actorStaffId: string, role: string, itemKey: string, verified: boolean) {
  const entityId = `${role}:${itemKey}`;
  const prior = await findLatestForEntityId(OPS_ACTIVITY_ENTITY.UAT, entityId);
  const previousLabel = prior ? extractNewValue(prior.action) : "Chưa xác minh";
  const nextLabel = verified ? "Đã xác minh" : "Chưa xác minh";
  const statusWord = verified ? "verified" : "unverified";

  await logActivity({
    staff_id: actorStaffId,
    action: `${statusWord} — ${formatChange(previousLabel, nextLabel)}`,
    entity: OPS_ACTIVITY_ENTITY.UAT,
    entity_id: entityId,
  });
}

// ============================================================
// Deployment History (§3)
// ============================================================

export async function getDeploymentLog(): Promise<ActivityLog[]> {
  return getActivityLogsByEntityType(OPS_ACTIVITY_ENTITY.DEPLOYMENT);
}

export async function logDeployment(
  actorStaffId: string,
  fields: { environment: string; version: string; notes?: string }
) {
  const prior = await findLatestForEntityId(OPS_ACTIVITY_ENTITY.DEPLOYMENT, fields.environment);
  const previous = extractNewValue(prior?.action);
  const next = `Triển khai "${fields.version}"${fields.notes ? ` — ${fields.notes}` : ""}`;

  await logActivity({
    staff_id: actorStaffId,
    action: formatChange(previous, next),
    entity: OPS_ACTIVITY_ENTITY.DEPLOYMENT,
    entity_id: fields.environment,
  });
}

// ============================================================
// Migration History (§6, DB §3.1 Migration Verification Checklist)
// ============================================================

export async function getMigrationVerificationLog(): Promise<ActivityLog[]> {
  return getActivityLogsByEntityType(OPS_ACTIVITY_ENTITY.MIGRATION);
}

export async function logMigrationVerification(
  actorStaffId: string,
  fields: {
    environment: string;
    migrationFile: string;
    completed: boolean;
    recordCounts: boolean;
    constraints: boolean;
    appStartup: boolean;
    notes?: string;
  }
) {
  const prior = await findLatestForEntityId(OPS_ACTIVITY_ENTITY.MIGRATION, fields.migrationFile);
  const previous = extractNewValue(prior?.action);

  const parts = [
    `Migration completed: ${fields.completed ? "✓" : "✗"}`,
    `Record counts: ${fields.recordCounts ? "✓" : "✗"}`,
    `Constraints: ${fields.constraints ? "✓" : "✗"}`,
    `Application startup: ${fields.appStartup ? "✓" : "✗"}`,
  ];
  const next = `[${fields.environment}] ${parts.join(", ")}${fields.notes ? ` — ${fields.notes}` : ""}`;

  await logActivity({
    staff_id: actorStaffId,
    action: formatChange(previous, next),
    entity: OPS_ACTIVITY_ENTITY.MIGRATION,
    entity_id: fields.migrationFile,
  });
}

// ============================================================
// Backup Status (§4, Decision 27 - operational metadata only)
// ============================================================

export async function getBackupConfirmationLog(): Promise<ActivityLog[]> {
  return getActivityLogsByEntityType(OPS_ACTIVITY_ENTITY.BACKUP);
}

export async function logBackupConfirmation(
  actorStaffId: string,
  fields: { environment: string; planTier: string; pitrEnabled: boolean; retentionDays?: number; notes?: string }
) {
  const prior = await findLatestForEntityId(OPS_ACTIVITY_ENTITY.BACKUP, fields.environment);
  const previous = extractNewValue(prior?.action);
  const next = `Plan: ${fields.planTier}, PITR: ${fields.pitrEnabled ? "bật" : "tắt"}${
    fields.retentionDays ? `, retention: ${fields.retentionDays} ngày` : ""
  }${fields.notes ? ` — ${fields.notes}` : ""}`;

  await logActivity({
    staff_id: actorStaffId,
    action: formatChange(previous, next),
    entity: OPS_ACTIVITY_ENTITY.BACKUP,
    entity_id: fields.environment,
  });
}

// ============================================================
// Restore History (§5, Decision 28 - 6 minimum fields)
// ============================================================

export async function getRestoreDrillLog(): Promise<ActivityLog[]> {
  return getActivityLogsByEntityType(OPS_ACTIVITY_ENTITY.RESTORE);
}

export async function logRestoreDrill(
  actorStaffId: string,
  fields: {
    environment: string;
    backupReference: string;
    restoreDuration: string;
    result: "success" | "failure";
    notes?: string;
  }
) {
  const prior = await findLatestForEntityId(OPS_ACTIVITY_ENTITY.RESTORE, fields.environment);
  const previous = extractNewValue(prior?.action);
  const next = `Backup ref: ${fields.backupReference}, thời gian: ${fields.restoreDuration}, kết quả: ${
    fields.result === "success" ? "Thành công" : "Thất bại"
  }${fields.notes ? ` — ${fields.notes}` : ""}`;

  await logActivity({
    staff_id: actorStaffId,
    action: formatChange(previous, next),
    entity: OPS_ACTIVITY_ENTITY.RESTORE,
    entity_id: fields.environment,
  });
}

/** Reads only the "Sau: ..." (New value) half of a Restore Drill's action
 * string - used by the UI to decide the Success/Failure badge without
 * risking a false match against a *previous* drill's result also
 * mentioned in the same string (Decision 38 keeps both values in one
 * field, so callers needing just the current result must extract it,
 * not substring-match the whole string). */
export function extractRestoreResult(action: string): "success" | "failure" {
  const newValue = extractNewValue(action);
  return newValue.includes("Thất bại") ? "failure" : "success";
}

// ============================================================
// Mobile Readiness Status (§18.1) - status/note is trackable, capability
// is not built (UI §16's own "status board, not implementation" framing).
// Outside Decision 36's 6-category classification - untouched by
// Decision 38's payload standardization.
// ============================================================

export async function getMobileReadinessNotesState(): Promise<Map<string, ActivityLog>> {
  const logs = await getActivityLogsByEntityType("mobile_readiness_note");
  return latestPerEntityId(logs);
}

export async function updateMobileReadinessNote(actorStaffId: string, itemKey: string, note: string) {
  await logActivity({
    staff_id: actorStaffId,
    action: note,
    entity: "mobile_readiness_note",
    entity_id: itemKey,
  });
}
