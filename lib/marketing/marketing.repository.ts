import { supabase } from "@/lib/supabase";
import { MARKETING_PAGE_SIZE } from "./marketing.constants";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScope } from "@/lib/permission/dataScope";
import {
  MarketingSegment,
  MarketingSegmentCondition,
  MarketingSegmentMember,
  MarketingCampaign,
  SegmentFilters,
  SegmentPage,
  CampaignFilters,
  CampaignPage,
  MarketingDashboardCounts,
  BirthdayBucket,
  BirthdayBucketCustomer,
} from "@/types/marketing";

// Raw Supabase access only - no business logic, no derived fields (same
// convention as lib/salesLedger/salesLedger.repository.ts). Every
// aggregate/live-count read goes through the Postgres RPC functions in
// supabase/migrations/20260727_marketing_functions.sql (+ the
// 20260728 relative-date fix) rather than fetching raw
// customers/customer_purchases rows to filter/aggregate here (Spec
// Feature 13).

// No FK hint needed (matches WITH_CUSTOMER-style embeds elsewhere in this
// codebase) - each of these tables has exactly one FK to the embedded
// table, so PostgREST's relationship detection is unambiguous.
const WITH_STAFF = "*, created_by_staff:staff(id, full_name)";
const WITH_CAMPAIGN_JOINS = "*, target_segment:marketing_segments(id, name, status), owner:staff(id, full_name)";

// ============================================================
// Segments
// ============================================================

/** Data Scope Rollout (Sprint v4.1), Package 7 - Segments' own ownership
 * field (`created_by`, uuid FK to staff.id) is distinct from Campaigns'
 * (`owner_staff_id`, below) - two different columns under Marketing's one
 * named resource (DATA_SCOPE_ROLLOUT_DATABASE.md §1/§5), so each gets its
 * own explicit `ownerField` passed to `applyDataScope`, never a shared
 * default. Applied last, after every existing filter, so Search
 * (Decision 48) only ever narrows within the already-scoped set. */
export async function findSegmentsPage(filters: SegmentFilters): Promise<SegmentPage> {
  let query = supabase.from("marketing_segments").select(WITH_STAFF, { count: "exact" });

  if (filters.search) {
    query = query.ilike("name", `%${filters.search.replace(/[%,]/g, "")}%`);
  }
  if (filters.segmentType && filters.segmentType !== "All") {
    query = query.eq("segment_type", filters.segmentType);
  }
  if (filters.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }

  const staff = await getCurrentStaff();
  if (staff) query = (await applyDataScope(query, staff, "marketing", "created_by")).query;

  query = query.order("updated_at", { ascending: false });

  const from = (filters.page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching segments page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingSegment[]) || [], totalCount: count ?? 0 };
}

/** Non-archived/active segments only - sources the Campaign create modal's
 * Target Segment picker (MARKETING_UI.md §5.2: "sourced from status =
 * 'Active' segments only on create"). */
export async function findActiveSegmentsForPicker(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("marketing_segments")
    .select("id, name")
    .eq("status", "Active")
    .order("name");
  if (error) {
    console.error("Error fetching active segments:", error);
    return [];
  }
  return data as { id: string; name: string }[];
}

/** Data Scope Rollout (Sprint v4.1), Package 7 - scoped the same way as the
 * list (above), so an out-of-scope segment id resolves to the same
 * "no row" outcome as a nonexistent one (DATA_SCOPE_ROLLOUT_UI.md §8 -
 * "not found," never "forbidden"). */
export async function findSegmentById(id: string): Promise<MarketingSegment | null> {
  let query = supabase.from("marketing_segments").select(WITH_STAFF).eq("id", id);

  const staff = await getCurrentStaff();
  if (staff) query = (await applyDataScope(query, staff, "marketing", "created_by")).query;

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("Error fetching segment:", error);
    return null;
  }
  return data as MarketingSegment | null;
}

export async function findSegmentConditions(segmentId: string): Promise<MarketingSegmentCondition[]> {
  const { data, error } = await supabase
    .from("marketing_segment_conditions")
    .select("*")
    .eq("segment_id", segmentId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Error fetching segment conditions:", error);
    return [];
  }
  return data as MarketingSegmentCondition[];
}

export async function createSegment(
  segment: Omit<MarketingSegment, "id" | "created_at" | "updated_at" | "created_by_staff">
): Promise<MarketingSegment | null> {
  const { data, error } = await supabase.from("marketing_segments").insert(segment).select().single();
  if (error) {
    console.error("Error creating segment:", error);
    return null;
  }
  return data as MarketingSegment;
}

export async function replaceSegmentConditions(
  segmentId: string,
  conditions: Omit<MarketingSegmentCondition, "id" | "segment_id">[]
): Promise<boolean> {
  const { error: deleteError } = await supabase.from("marketing_segment_conditions").delete().eq("segment_id", segmentId);
  if (deleteError) {
    console.error("Error clearing segment conditions:", deleteError);
    return false;
  }
  if (conditions.length === 0) return true;

  const rows = conditions.map((c) => ({ ...c, segment_id: segmentId }));
  const { error: insertError } = await supabase.from("marketing_segment_conditions").insert(rows);
  if (insertError) {
    console.error("Error inserting segment conditions:", insertError);
    return false;
  }
  return true;
}

export async function updateSegment(
  id: string,
  fields: Partial<Pick<MarketingSegment, "name" | "description" | "condition_logic" | "status">>
): Promise<MarketingSegment | null> {
  const { data, error } = await supabase.from("marketing_segments").update(fields).eq("id", id).select().single();
  if (error) {
    console.error("Error updating segment:", error);
    return null;
  }
  return data as MarketingSegment;
}

export async function countCampaignsTargetingSegment(segmentId: string): Promise<number> {
  const { count, error } = await supabase
    .from("marketing_campaigns")
    .select("*", { count: "exact", head: true })
    .eq("target_segment_id", segmentId);
  if (error) {
    console.error("Error counting campaigns targeting segment:", error);
    return 0;
  }
  return count ?? 0;
}

// ============================================================
// Manual segment members
// ============================================================

export async function findSegmentMembersPage(
  segmentId: string,
  page: number,
  search?: string
): Promise<{ rows: MarketingSegmentMember[]; totalCount: number }> {
  let query = supabase
    .from("marketing_segment_members")
    .select("*, customer:customers(id, full_name, customer_code, phone)", { count: "exact" })
    .eq("segment_id", segmentId);

  if (search) {
    // Filtering on an embedded relation's column isn't supported directly by
    // PostgREST for `.ilike`, so member search narrows by customer_id first.
    const { data: matchingCustomers } = await supabase
      .from("customers")
      .select("id")
      .ilike("full_name", `%${search.replace(/[%,]/g, "")}%`);
    const ids = (matchingCustomers || []).map((c) => c.id);
    query = query.in("customer_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  const from = (page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.order("added_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching segment members:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingSegmentMember[]) || [], totalCount: count ?? 0 };
}

export async function countSegmentMembers(segmentId: string): Promise<number> {
  const { count, error } = await supabase
    .from("marketing_segment_members")
    .select("*", { count: "exact", head: true })
    .eq("segment_id", segmentId);
  if (error) {
    console.error("Error counting segment members:", error);
    return 0;
  }
  return count ?? 0;
}

export async function addSegmentMembers(
  segmentId: string,
  customerIds: string[],
  addedBy: string | null
): Promise<boolean> {
  if (customerIds.length === 0) return true;
  const rows = customerIds.map((customer_id) => ({ segment_id: segmentId, customer_id, added_by: addedBy }));
  const { error } = await supabase.from("marketing_segment_members").upsert(rows, { onConflict: "segment_id,customer_id", ignoreDuplicates: true });
  if (error) {
    console.error("Error adding segment members:", error);
    return false;
  }
  return true;
}

export async function removeSegmentMember(segmentId: string, customerId: string): Promise<boolean> {
  const { error } = await supabase
    .from("marketing_segment_members")
    .delete()
    .eq("segment_id", segmentId)
    .eq("customer_id", customerId);
  if (error) {
    console.error("Error removing segment member:", error);
    return false;
  }
  return true;
}

// ============================================================
// Dynamic segment evaluation (Postgres RPC - see migration file header)
// ============================================================

export async function getSegmentMatchCount(
  conditions: { field: string; operator: string; value: unknown }[],
  logic: "AND" | "OR"
): Promise<number> {
  const { data, error } = await supabase.rpc("marketing_segment_customer_count", {
    p_conditions: conditions,
    p_logic: logic,
  });
  if (error) {
    console.error("Error computing segment match count:", error);
    return 0;
  }
  return Number(data) || 0;
}

export async function getSegmentMatchSample(
  conditions: { field: string; operator: string; value: unknown }[],
  logic: "AND" | "OR",
  limit: number,
  offset: number
): Promise<{ id: string; customer_code: string; full_name: string; phone: string }[]> {
  const { data, error } = await supabase.rpc("marketing_segment_customer_list", {
    p_conditions: conditions,
    p_logic: logic,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.error("Error computing segment match sample:", error);
    return [];
  }
  return data as { id: string; customer_code: string; full_name: string; phone: string }[];
}

// ============================================================
// Campaigns
// ============================================================

/** Data Scope Rollout (Sprint v4.1), Package 7 - Campaigns' ownership field
 * is `owner_staff_id`, distinct from Segments' `created_by` (above). The
 * existing `filters.ownerStaffId` is a caller-supplied UI filter (e.g. "show
 * only campaigns owned by X"), not scope enforcement - Data Scope is
 * applied after it, narrowing further, never replacing it (Decision 48). */
export async function findCampaignsPage(filters: CampaignFilters): Promise<CampaignPage> {
  let query = supabase.from("marketing_campaigns").select(WITH_CAMPAIGN_JOINS, { count: "exact" });

  if (filters.search) {
    query = query.ilike("name", `%${filters.search.replace(/[%,]/g, "")}%`);
  }
  if (filters.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }
  if (filters.ownerStaffId) {
    query = query.eq("owner_staff_id", filters.ownerStaffId);
  }

  const staff = await getCurrentStaff();
  if (staff) query = (await applyDataScope(query, staff, "marketing", "owner_staff_id")).query;

  query = query.order("start_date", { ascending: false });

  const from = (filters.page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching campaigns page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingCampaign[]) || [], totalCount: count ?? 0 };
}

/** Data Scope Rollout (Sprint v4.1), Package 7 - same "not found, never
 * forbidden" treatment as findSegmentById above. */
export async function findCampaignById(id: string): Promise<MarketingCampaign | null> {
  let query = supabase.from("marketing_campaigns").select(WITH_CAMPAIGN_JOINS).eq("id", id);

  const staff = await getCurrentStaff();
  if (staff) query = (await applyDataScope(query, staff, "marketing", "owner_staff_id")).query;

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("Error fetching campaign:", error);
    return null;
  }
  return data as MarketingCampaign | null;
}

export async function findCampaignsTargetingSegment(segmentId: string): Promise<MarketingCampaign[]> {
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("id, name, status, start_date, end_date")
    .eq("target_segment_id", segmentId)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("Error fetching campaigns targeting segment:", error);
    return [];
  }
  return data as MarketingCampaign[];
}

export async function createCampaign(
  campaign: Omit<MarketingCampaign, "id" | "created_at" | "updated_at" | "target_segment" | "owner">
): Promise<MarketingCampaign | null> {
  const { data, error } = await supabase.from("marketing_campaigns").insert(campaign).select().single();
  if (error) {
    console.error("Error creating campaign:", error);
    return null;
  }
  return data as MarketingCampaign;
}

export async function updateCampaign(
  id: string,
  fields: Partial<Pick<MarketingCampaign, "name" | "description" | "target_segment_id" | "start_date" | "end_date" | "owner_staff_id" | "status">>
): Promise<MarketingCampaign | null> {
  const { data, error } = await supabase.from("marketing_campaigns").update(fields).eq("id", id).select().single();
  if (error) {
    console.error("Error updating campaign:", error);
    return null;
  }
  return data as MarketingCampaign;
}

export async function findCampaignsBySegmentIds(segmentIds: string[]): Promise<MarketingCampaign[]> {
  if (segmentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("id, name, status, start_date, end_date, target_segment_id")
    .in("target_segment_id", segmentIds)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("Error fetching campaigns for customer's segments:", error);
    return [];
  }
  return data as MarketingCampaign[];
}

// ============================================================
// Dashboard + Birthday Center (Postgres RPC)
// ============================================================

export async function getDashboardCounts(): Promise<MarketingDashboardCounts | null> {
  const { data, error } = await supabase.rpc("marketing_dashboard_counts");
  if (error || !data || data.length === 0) {
    if (error) console.error("Error fetching marketing dashboard counts:", error);
    return null;
  }
  const row = data[0];
  return {
    segmentCount: Number(row.segment_count) || 0,
    campaignCount: Number(row.campaign_count) || 0,
    birthdayToday: Number(row.birthday_today) || 0,
    birthdayThisMonth: Number(row.birthday_this_month) || 0,
    noPurchase30: Number(row.no_purchase_30) || 0,
    noPurchase60: Number(row.no_purchase_60) || 0,
    noPurchase90: Number(row.no_purchase_90) || 0,
  };
}

export async function getBirthdayBucket(bucket: BirthdayBucket, search?: string): Promise<BirthdayBucketCustomer[]> {
  const { data, error } = await supabase.rpc("marketing_birthday_customers", {
    p_bucket: bucket,
    p_search: search || null,
  });
  if (error) {
    console.error(`Error fetching birthday bucket "${bucket}":`, error);
    return [];
  }
  return data as BirthdayBucketCustomer[];
}

// ============================================================
// Segments referenced by a customer's Manual-segment membership (for the
// Customer Detail "Campaign History" section, Spec §2.6).
// ============================================================

export async function findSegmentIdsForCustomer(customerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("marketing_segment_members")
    .select("segment_id")
    .eq("customer_id", customerId);
  if (error) {
    console.error("Error fetching customer's manual segment memberships:", error);
    return [];
  }
  return (data || []).map((r) => r.segment_id);
}
