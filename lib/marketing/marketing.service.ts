import * as repo from "./marketing.repository";
import { MARKETING_PAGE_SIZE } from "./marketing.constants";
import {
  MarketingSegment,
  MarketingSegmentCondition,
  MarketingCampaign,
  SegmentFilters,
  SegmentPage,
  CampaignFilters,
  CampaignPage,
  SegmentPreviewResult,
  MarketingDashboardCounts,
  BirthdayCenterData,
  CAMPAIGN_STATUS_TRANSITIONS,
  CampaignStatus,
} from "@/types/marketing";

// Business logic / composition only - marketing.repository.ts owns every
// direct Supabase call (same split as lib/salesLedger/). Dynamic segment
// matching itself happens in Postgres (see the RPC functions) - nothing
// here re-implements condition evaluation in JS.

const PREVIEW_SAMPLE_SIZE = 5;

// ============================================================
// Segments (list, detail)
// ============================================================

export async function getSegmentsPage(filters: SegmentFilters): Promise<SegmentPage> {
  const page = await repo.findSegmentsPage(filters);
  // Attach a live Customer Count per row (Segment List column, MARKETING_UI.md §4).
  // One RPC/count call per row is an accepted tradeoff for a page of
  // MARKETING_PAGE_SIZE rows - each condition set is distinct per segment,
  // so it can't be batched into a single aggregate query.
  const rows = await Promise.all(
    page.rows.map(async (segment) => ({
      ...segment,
      customerCount: await getSegmentCustomerCount(segment),
    }))
  );
  return { rows, totalCount: page.totalCount };
}

async function getSegmentCustomerCount(segment: MarketingSegment): Promise<number> {
  if (segment.segment_type === "Manual") {
    return repo.countSegmentMembers(segment.id!);
  }
  const conditions = await repo.findSegmentConditions(segment.id!);
  return repo.getSegmentMatchCount(
    conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
    segment.condition_logic || "AND"
  );
}

export async function getActiveSegmentsForPicker() {
  return repo.findActiveSegmentsForPicker();
}

export interface SegmentDetail {
  segment: MarketingSegment;
  conditions: MarketingSegmentCondition[];
  customerCount: number;
  estimatedReach: number;
  campaigns: MarketingCampaign[];
}

export async function getSegmentDetail(id: string): Promise<SegmentDetail | null> {
  const segment = await repo.findSegmentById(id);
  if (!segment) return null;

  const [conditions, campaigns] = await Promise.all([
    segment.segment_type === "Dynamic" ? repo.findSegmentConditions(id) : Promise.resolve([]),
    repo.findCampaignsTargetingSegment(id),
  ]);

  const customerCount = await getSegmentCustomerCount(segment);

  return {
    segment,
    conditions,
    customerCount,
    estimatedReach: customerCount, // V1 Product Owner Decision: identical.
    campaigns,
  };
}

export async function getSegmentMembersPage(segmentId: string, page: number, search?: string) {
  return repo.findSegmentMembersPage(segmentId, page, search);
}

// ============================================================
// Segment Builder - Live Preview (Feature 3), Save, Duplicate, Archive
// ============================================================

/** Feature 3 - Live Preview. Evaluates a DRAFT condition set that may not
 * be saved yet (Segment Builder calls this on every debounced change,
 * before Save) - never reads marketing_segment_conditions itself. */
export async function previewDynamicSegment(
  conditions: Pick<MarketingSegmentCondition, "field" | "operator" | "value">[],
  logic: "AND" | "OR"
): Promise<SegmentPreviewResult> {
  const [customerCount, sampleCustomers] = await Promise.all([
    repo.getSegmentMatchCount(conditions, logic),
    repo.getSegmentMatchSample(conditions, logic, PREVIEW_SAMPLE_SIZE, 0),
  ]);
  return { customerCount, estimatedReach: customerCount, sampleCustomers };
}

export async function createDynamicSegment(input: {
  name: string;
  description?: string | null;
  conditionLogic: "AND" | "OR";
  conditions: Pick<MarketingSegmentCondition, "field" | "operator" | "value">[];
  createdBy: string | null;
}): Promise<MarketingSegment | null> {
  const segment = await repo.createSegment({
    name: input.name,
    description: input.description ?? null,
    segment_type: "Dynamic",
    condition_logic: input.conditionLogic,
    status: "Active",
    created_by: input.createdBy,
  });
  if (!segment?.id) return null;

  const ok = await repo.replaceSegmentConditions(
    segment.id,
    input.conditions.map((c, i) => ({ ...c, sort_order: i }))
  );
  if (!ok) return null;
  return segment;
}

export async function createManualSegment(input: {
  name: string;
  description?: string | null;
  customerIds: string[];
  createdBy: string | null;
}): Promise<MarketingSegment | null> {
  const segment = await repo.createSegment({
    name: input.name,
    description: input.description ?? null,
    segment_type: "Manual",
    condition_logic: null,
    status: "Active",
    created_by: input.createdBy,
  });
  if (!segment?.id) return null;

  await repo.addSegmentMembers(segment.id, input.customerIds, input.createdBy);
  return segment;
}

export async function updateDynamicSegment(
  id: string,
  input: {
    name: string;
    description?: string | null;
    conditionLogic: "AND" | "OR";
    conditions: Pick<MarketingSegmentCondition, "field" | "operator" | "value">[];
  }
): Promise<MarketingSegment | null> {
  const segment = await repo.updateSegment(id, {
    name: input.name,
    description: input.description ?? null,
    condition_logic: input.conditionLogic,
  });
  if (!segment) return null;

  await repo.replaceSegmentConditions(
    id,
    input.conditions.map((c, i) => ({ ...c, sort_order: i }))
  );
  return segment;
}

export async function updateManualSegmentInfo(
  id: string,
  input: { name: string; description?: string | null }
): Promise<MarketingSegment | null> {
  return repo.updateSegment(id, { name: input.name, description: input.description ?? null });
}

export async function addCustomersToManualSegment(segmentId: string, customerIds: string[], addedBy: string | null) {
  return repo.addSegmentMembers(segmentId, customerIds, addedBy);
}

export async function removeCustomerFromManualSegment(segmentId: string, customerId: string) {
  return repo.removeSegmentMember(segmentId, customerId);
}

/** Duplicate (Spec §4.4): copies Segment Type/Condition Logic/conditions
 * for Dynamic; for Manual, the member list is deliberately NOT copied
 * (MARKETING_UI.md §4.4 judgment call - duplicating a definition, not its
 * membership). Lands with status Active and a "(Copy)" name suffix. */
export async function duplicateSegment(id: string, createdBy: string | null): Promise<MarketingSegment | null> {
  const original = await repo.findSegmentById(id);
  if (!original) return null;

  const copy = await repo.createSegment({
    name: `${original.name} (Copy)`,
    description: original.description ?? null,
    segment_type: original.segment_type,
    condition_logic: original.condition_logic ?? null,
    status: "Active",
    created_by: createdBy,
  });
  if (!copy?.id) return null;

  if (original.segment_type === "Dynamic") {
    const conditions = await repo.findSegmentConditions(id);
    await repo.replaceSegmentConditions(
      copy.id,
      conditions.map((c, i) => ({ field: c.field, operator: c.operator, value: c.value, sort_order: i }))
    );
  }
  return copy;
}

/** Archive/Activate/Deactivate (MARKETING_UI.md §4.3, unblocked Revision
 * 2). There is no hard-delete for segments this sprint - status is the
 * only "remove from use" mechanism, and a campaign-targeted segment is
 * blocked from ever being deleted anyway (ON DELETE RESTRICT). */
export async function setSegmentStatus(id: string, status: "Active" | "Inactive" | "Archived") {
  return repo.updateSegment(id, { status });
}

// ============================================================
// Campaigns
// ============================================================

export async function getCampaignsPage(filters: CampaignFilters): Promise<CampaignPage> {
  return repo.findCampaignsPage(filters);
}

export async function getCampaignDetail(id: string): Promise<MarketingCampaign | null> {
  return repo.findCampaignById(id);
}

export class CampaignTransitionError extends Error {
  constructor(from: CampaignStatus, to: CampaignStatus) {
    super(`Cannot transition campaign from "${from}" to "${to}".`);
    this.name = "CampaignTransitionError";
  }
}

/** Locked lifecycle (Product Owner Decision, MARKETING_SPEC.md Revision 2
 * §9): Draft -> Active -> Paused -> Active -> Completed, or Draft ->
 * Cancelled. Completed/Cancelled terminal. Judgment call (disclosed): also
 * allows cancelling from Active/Paused, not just Draft, since a real
 * running/paused campaign needs to be cancellable too - the brief's
 * diagram only drew one cancel path but didn't state Cancel is Draft-only. */
export function getValidNextStatuses(current: CampaignStatus): CampaignStatus[] {
  return CAMPAIGN_STATUS_TRANSITIONS[current];
}

export async function createCampaign(input: {
  name: string;
  description?: string | null;
  targetSegmentId: string;
  startDate: string;
  endDate?: string | null;
  ownerStaffId: string;
}): Promise<MarketingCampaign | null> {
  return repo.createCampaign({
    name: input.name,
    description: input.description ?? null,
    target_segment_id: input.targetSegmentId,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    owner_staff_id: input.ownerStaffId,
    status: "Draft",
  });
}

export async function updateCampaignDetails(
  id: string,
  input: {
    name: string;
    description?: string | null;
    targetSegmentId: string;
    startDate: string;
    endDate?: string | null;
    ownerStaffId: string;
  }
): Promise<MarketingCampaign | null> {
  return repo.updateCampaign(id, {
    name: input.name,
    description: input.description ?? null,
    target_segment_id: input.targetSegmentId,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    owner_staff_id: input.ownerStaffId,
  });
}

export async function changeCampaignStatus(id: string, currentStatus: CampaignStatus, nextStatus: CampaignStatus) {
  if (!getValidNextStatuses(currentStatus).includes(nextStatus)) {
    throw new CampaignTransitionError(currentStatus, nextStatus);
  }
  return repo.updateCampaign(id, { status: nextStatus });
}

// ============================================================
// Marketing Dashboard (Feature 11)
// ============================================================

export async function getDashboardCounts(): Promise<MarketingDashboardCounts> {
  const counts = await repo.getDashboardCounts();
  return (
    counts ?? {
      segmentCount: 0,
      campaignCount: 0,
      birthdayToday: 0,
      birthdayThisMonth: 0,
      noPurchase30: 0,
      noPurchase60: 0,
      noPurchase90: 0,
    }
  );
}

// ============================================================
// Birthday Center (Feature 10)
// ============================================================

export async function getBirthdayCenterData(monthSearch?: string): Promise<BirthdayCenterData> {
  const [today, thisWeek, thisMonth] = await Promise.all([
    repo.getBirthdayBucket("today"),
    repo.getBirthdayBucket("week"),
    repo.getBirthdayBucket("month", monthSearch),
  ]);
  return { today, thisWeek, thisMonth };
}

// ============================================================
// Customer Detail's "Campaign History" section (Spec §2.6 - future
// integration only, plan-level association, no send/open/click data).
// ============================================================

export async function getCampaignHistoryForCustomer(customerId: string): Promise<MarketingCampaign[]> {
  const segmentIds = await repo.findSegmentIdsForCustomer(customerId);
  if (segmentIds.length === 0) return [];
  return repo.findCampaignsBySegmentIds(segmentIds);
}

export { MARKETING_PAGE_SIZE };
