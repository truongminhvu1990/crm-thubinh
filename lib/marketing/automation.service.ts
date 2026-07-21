import * as repo from "./automation.repository";
import * as marketingRepo from "./marketing.repository";
import {
  MarketingAutomation,
  MarketingAutomationRun,
  AutomationFilters,
  AutomationPage,
  AutomationRunFilters,
  AutomationRunPage,
  AutomationStatus,
  AUTOMATION_STATUS_TRANSITIONS,
  AutomationDashboardCounts,
  AutomationExecutionStats,
  AutomationFrequency,
} from "@/types/marketingAutomation";
import { logActivity } from "@/lib/activityLog.service";

// Business logic / composition only - automation.repository.ts owns every
// direct Supabase call (same split as marketing.service.ts). Package 3 -
// Service Layer.

// Bounded simulation audience size (disclosed judgment call, Self Review):
// Spec Rev.2 leaves "concrete per-recipient outcome logic" as a Development
// detail (Open Question #6) and this project's Performance rule requires
// "Batch Processing must not be a per-row round trip" - a large segment's
// full membership is capped here rather than simulating an unbounded
// customer set on every Manual/Run Now click.
const SIMULATION_AUDIENCE_CAP = 200;

// ============================================================
// Automation List / Detail
// ============================================================

export async function getAutomationsPage(filters: AutomationFilters): Promise<AutomationPage> {
  const page = await repo.findAutomationsPage(filters);
  const ids = page.rows.map((a) => a.id!).filter(Boolean);
  const latestRuns = await repo.findLatestRunsForAutomations(ids);
  return {
    rows: page.rows.map((automation) => ({ ...automation, lastRun: latestRuns[automation.id!] || null })),
    totalCount: page.totalCount,
  };
}

export interface AutomationDetail {
  automation: MarketingAutomation;
  campaigns: { id: string; name: string; status: string }[];
  stats: AutomationExecutionStats;
}

export async function getAutomationDetail(id: string): Promise<AutomationDetail | null> {
  const automation = await repo.findAutomationById(id);
  if (!automation) return null;

  const [campaignLinks, stats] = await Promise.all([
    repo.findCampaignsForAutomation(id),
    computeExecutionStats(id),
  ]);

  return {
    automation,
    campaigns: campaignLinks.map((l) => l.campaign!).filter(Boolean) as { id: string; name: string; status: string }[],
    stats,
  };
}

async function computeExecutionStats(automationId: string): Promise<AutomationExecutionStats> {
  // A page of MARKETING_PAGE_SIZE runs isn't enough for an accurate lifetime
  // Success Rate on an automation with a long history, so this reads every
  // run row for the one automation directly (bounded by that one
  // automation's own history, not the whole table).
  const { rows } = await repo.findRunsPage({ automationId, page: 1 });
  let allRows = rows;
  let page = 2;
  while (rows.length === 20 && page < 50) {
    const next = await repo.findRunsPage({ automationId, page });
    if (next.rows.length === 0) break;
    allRows = allRows.concat(next.rows);
    page++;
  }

  const finished = allRows.filter((r) => r.status !== "Pending" && r.status !== "Running");
  const successes = finished.filter((r) => r.status === "Success");
  const failures = finished.filter((r) => r.status === "Failed");

  return {
    totalRuns: allRows.length,
    successRate: finished.length > 0 ? Math.round((successes.length / finished.length) * 100) : 0,
    lastSuccessAt: successes[0]?.started_at ?? null,
    lastFailureAt: failures[0]?.started_at ?? null,
  };
}

export async function getRunsPage(filters: AutomationRunFilters): Promise<AutomationRunPage> {
  return repo.findRunsPage(filters);
}

/** Client-computed, explicitly-labeled estimate only - no `next_run_at`
 * column exists (docs/MARKETING_AUTOMATION_DATABASE.md §8, "Explicitly NOT
 * designed"). Returns null when there's nothing to estimate from (not
 * Active, not Daily Schedule, or never run). */
export function estimateNextRun(automation: Pick<MarketingAutomation, "status" | "trigger_type" | "frequency">, lastRun: MarketingAutomationRun | null | undefined): Date | null {
  if (automation.status !== "Active" || automation.trigger_type !== "Daily Schedule") return null;
  if (!lastRun?.started_at) return null;

  const daysByFrequency: Record<AutomationFrequency, number> = { Once: 0, Daily: 1, Weekly: 7, Monthly: 30 };
  const days = daysByFrequency[automation.frequency];
  if (days === 0) return null;

  const next = new Date(lastRun.started_at);
  next.setDate(next.getDate() + days);
  return next;
}

// ============================================================
// Create / Edit
// ============================================================

export async function createAutomation(input: {
  name: string;
  description?: string | null;
  automationType: MarketingAutomation["automation_type"];
  triggerType: MarketingAutomation["trigger_type"];
  frequency: MarketingAutomation["frequency"];
  targetSegmentId: string;
  createdBy: string | null;
}): Promise<MarketingAutomation | null> {
  const automation = await repo.createAutomation({
    name: input.name,
    description: input.description ?? null,
    automation_type: input.automationType,
    trigger_type: input.triggerType,
    frequency: input.frequency,
    target_segment_id: input.targetSegmentId,
    status: "Draft",
    created_by: input.createdBy,
  });
  if (automation?.id) {
    await logActivity({ staff_id: input.createdBy, action: "Automation Created", entity: "marketing_automation", entity_id: automation.id });
  }
  return automation;
}

/** Editing always increments `version` (Wizard Step 4's "Saving will
 * increment version to vN+1" notice, MARKETING_AUTOMATION_UI.md §3.4). */
export async function updateAutomation(
  id: string,
  currentVersion: number,
  input: {
    name: string;
    description?: string | null;
    automationType: MarketingAutomation["automation_type"];
    triggerType: MarketingAutomation["trigger_type"];
    frequency: MarketingAutomation["frequency"];
    targetSegmentId: string;
  },
  updatedBy: string | null
): Promise<MarketingAutomation | null> {
  const automation = await repo.updateAutomation(id, {
    name: input.name,
    description: input.description ?? null,
    automation_type: input.automationType,
    trigger_type: input.triggerType,
    frequency: input.frequency,
    target_segment_id: input.targetSegmentId,
    version: currentVersion + 1,
  });
  if (automation) {
    await logActivity({ staff_id: updatedBy, action: "Automation Updated", entity: "marketing_automation", entity_id: id });
  }
  return automation;
}

// ============================================================
// Status lifecycle - reuses Campaign's locked transition rule (Spec Rev.2
// decision #3), same class-based error convention as
// marketing.service.ts's CampaignTransitionError.
// ============================================================

export class AutomationTransitionError extends Error {
  constructor(from: AutomationStatus, to: AutomationStatus) {
    super(`Cannot transition automation from "${from}" to "${to}".`);
    this.name = "AutomationTransitionError";
  }
}

export function getValidNextStatuses(current: AutomationStatus): AutomationStatus[] {
  return AUTOMATION_STATUS_TRANSITIONS[current];
}

const STATUS_ACTIVITY_ACTION: Record<AutomationStatus, string> = {
  Draft: "Automation Updated",
  Active: "Automation Activated",
  Paused: "Automation Paused",
  Completed: "Automation Completed",
  Cancelled: "Automation Cancelled",
};

export async function changeAutomationStatus(
  id: string,
  currentStatus: AutomationStatus,
  nextStatus: AutomationStatus,
  staffId: string | null
): Promise<MarketingAutomation | null> {
  if (!getValidNextStatuses(currentStatus).includes(nextStatus)) {
    throw new AutomationTransitionError(currentStatus, nextStatus);
  }
  const automation = await repo.updateAutomation(id, { status: nextStatus });
  if (automation) {
    await logActivity({ staff_id: staffId, action: STATUS_ACTIVITY_ACTION[nextStatus], entity: "marketing_automation", entity_id: id });
  }
  return automation;
}

/** Bulk Activate/Pause/Cancel (MARKETING_AUTOMATION_UI.md §3.2) - strictly a
 * multi-row application of the single-row transition rule; rows for which
 * the transition isn't valid are silently skipped, matching the locked UI's
 * "Đã cập nhật X/N automation" summary. */
export async function bulkChangeAutomationStatus(
  automations: Pick<MarketingAutomation, "id" | "status">[],
  nextStatus: AutomationStatus,
  staffId: string | null
): Promise<{ succeeded: number; total: number }> {
  let succeeded = 0;
  for (const automation of automations) {
    if (!getValidNextStatuses(automation.status).includes(nextStatus)) continue;
    const updated = await repo.updateAutomation(automation.id!, { status: nextStatus });
    if (updated) {
      succeeded++;
      await logActivity({ staff_id: staffId, action: STATUS_ACTIVITY_ACTION[nextStatus], entity: "marketing_automation", entity_id: automation.id! });
    }
  }
  return { succeeded, total: automations.length };
}

// ============================================================
// Broadcast Simulation (Package 6) - "Run Now" execution. The locked UI doc
// (§2 Journey A/B) never draws an explicit trigger control since Daily
// Schedule's invocation mechanism is out of scope, but Execution
// History/Delivery Status/Retry Failed are all binding Spec requirements
// that need *something* to produce a run - disclosed gap, resolved as a
// manual "Run Now" action (Detail header + List row action), enabled
// whenever status = Active, always recorded with triggered_by = 'Manual'
// for that one run (per-run field, independent of the automation's own
// trigger_type - see DATABASE.md §2.2's rationale for that column).
// ============================================================

/** Deterministic-enough simulated outcome (Spec Open Question #6) - not a
 * true RNG so the same customer/run combination is reproducible, not a
 * flat always-succeed. ~85% success rate. */
function simulateOutcome(customerId: string): { result: "Success" | "Failed"; message: string } {
  let hash = 0;
  for (let i = 0; i < customerId.length; i++) hash = (hash * 31 + customerId.charCodeAt(i)) >>> 0;
  const success = hash % 100 < 85;
  return success
    ? { result: "Success", message: "Đã gửi thành công (giả lập)." }
    : { result: "Failed", message: "Gửi thất bại (giả lập)." };
}

async function resolveSegmentAudience(segmentId: string): Promise<string[]> {
  const segment = await marketingRepo.findSegmentById(segmentId);
  if (!segment) return [];

  if (segment.segment_type === "Manual") {
    const ids: string[] = [];
    let page = 1;
    while (ids.length < SIMULATION_AUDIENCE_CAP) {
      const { rows, totalCount } = await marketingRepo.findSegmentMembersPage(segmentId, page);
      ids.push(...rows.map((m) => m.customer_id));
      if (rows.length === 0 || ids.length >= totalCount) break;
      page++;
    }
    return ids.slice(0, SIMULATION_AUDIENCE_CAP);
  }

  const conditions = await marketingRepo.findSegmentConditions(segmentId);
  const sample = await marketingRepo.getSegmentMatchSample(
    conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
    segment.condition_logic || "AND",
    SIMULATION_AUDIENCE_CAP,
    0
  );
  return sample.map((c) => c.id);
}

/** Revision 1 correction: Run Now is only available when the automation's
 * status is Active - the prior pass only hid the button in the UI, this
 * enforces it server-side too. */
export class AutomationNotActiveError extends Error {
  constructor() {
    super("Chỉ có thể chạy automation khi ở trạng thái Active.");
    this.name = "AutomationNotActiveError";
  }
}

/** Run-level status when recipients are mixed: any Failed recipient marks
 * the whole run Failed (disclosed judgment call - DATABASE.md §8 item 8
 * flags that Revision 2 dropped the "mixed outcome" run status, leaving
 * this rule to Development). */
export async function executeAutomationRun(automationId: string, staffId: string | null): Promise<MarketingAutomationRun | null> {
  const automation = await repo.findAutomationById(automationId);
  if (!automation) return null;
  if (automation.status !== "Active") throw new AutomationNotActiveError();

  const startedAt = Date.now();
  const run = await repo.createRun({ automation_id: automationId, triggered_by: "Manual", status: "Running" });
  if (!run?.id) return null;

  const customerIds = await resolveSegmentAudience(automation.target_segment_id);
  const logs = customerIds.map((customerId) => {
    const outcome = simulateOutcome(`${run.id}:${customerId}`);
    return { run_id: run.id!, customer_id: customerId, result: outcome.result, message: outcome.message };
  });
  await repo.createLogs(logs);

  const hasFailure = logs.some((l) => l.result === "Failed");
  const finishedAt = new Date();
  const updated = await repo.updateRun(run.id, {
    status: hasFailure ? "Failed" : "Success",
    finished_at: finishedAt.toISOString(),
    duration_ms: Date.now() - startedAt,
  });

  await logActivity({ staff_id: staffId, action: "Broadcast Executed", entity: "marketing_automation_run", entity_id: run.id });
  return updated;
}

/** Retry Failed (Revision 1 correction) - retries only the previously-failed
 * recipients by updating their existing log rows in place; does NOT create
 * a new Automation Run, and the original run's own fields (status,
 * started_at, finished_at, duration_ms) are left untouched, so Execution
 * History keeps showing exactly the one original run it always did. */
export async function retryFailedRecipients(originalRunId: string, staffId: string | null): Promise<MarketingAutomationRun | null> {
  const originalRun = await repo.findRunById(originalRunId);
  if (!originalRun) return null;

  const failedCustomerIds = await repo.findFailedCustomerIdsForRun(originalRunId);
  if (failedCustomerIds.length === 0) return null;

  for (const customerId of failedCustomerIds) {
    // Nonce (Date.now()) keeps this from being the exact same deterministic
    // input as the original attempt - otherwise a retry of a failed
    // recipient would always simulate "Failed" again, making Retry a no-op.
    const outcome = simulateOutcome(`${originalRunId}:retry:${customerId}:${Date.now()}`);
    await repo.updateLogResult(originalRunId, customerId, outcome.result, outcome.message);
  }

  await logActivity({ staff_id: staffId, action: "Broadcast Executed", entity: "marketing_automation_run", entity_id: originalRunId });
  return originalRun;
}

export async function getLogsByRun(runId: string, page: number) {
  return repo.findLogsByRun(runId, page);
}

// ============================================================
// Campaign Reference (read-only on Detail; Link action is the only write)
// ============================================================

export async function getLinkableCampaigns() {
  return repo.findLinkableCampaigns();
}

export async function linkCampaignToAutomation(campaignId: string, automationId: string, staffId: string | null): Promise<boolean> {
  const ok = await repo.linkCampaignAutomation(campaignId, automationId, staffId);
  if (ok) {
    await logActivity({ staff_id: staffId, action: "Automation Updated", entity: "marketing_automation", entity_id: automationId });
  }
  return ok;
}

// ============================================================
// Dashboard (Package 4) - 5 locked KPI cards + 3 additive panels
// ============================================================

export async function getAutomationDashboardCounts(): Promise<AutomationDashboardCounts> {
  const [totalAutomations, activeAutomations, pausedAutomations, todaysRuns, failedRunsToday] = await Promise.all([
    repo.countAllAutomations(),
    repo.countAutomationsByStatus("Active"),
    repo.countAutomationsByStatus("Paused"),
    repo.countRunsToday(),
    repo.countFailedRunsToday(),
  ]);
  return { totalAutomations, activeAutomations, pausedAutomations, todaysRuns, failedRunsToday };
}

export async function getRecentExecutions(limit = 10) {
  return repo.findRecentRuns(limit);
}

export interface LatestBroadcastSummary {
  run: MarketingAutomationRun;
  recipientCount: number;
}

export async function getLatestBroadcastSummary(): Promise<LatestBroadcastSummary | null> {
  const run = await repo.findLatestBroadcastRun();
  if (!run?.id) return null;
  const { totalCount } = await repo.findLogsByRun(run.id, 1);
  return { run, recipientCount: totalCount };
}

export async function getBroadcastRunsPage(page: number) {
  return repo.findBroadcastRunsPage(page);
}

export async function getBroadcastDeliverySummary() {
  return repo.countBroadcastLogResults();
}
