// Marketing CRM Foundation (Sprint v3.0.0). See docs/MARKETING_SPEC.md,
// docs/MARKETING_DATABASE.md, docs/MARKETING_UI.md (all Revision 2, LOCKED).

export type SegmentType = "Dynamic" | "Manual";
export type SegmentStatus = "Active" | "Inactive" | "Archived";
export type ConditionLogic = "AND" | "OR";

/** Exactly the 13 keys locked in MARKETING_DATABASE.md §2 / the migration's CHECK constraint. */
export type SegmentConditionField =
  | "purchase_count"
  | "lifetime_revenue"
  | "last_purchase"
  | "first_purchase"
  | "birthday"
  | "province"
  | "district"
  | "assigned_staff"
  | "favorite_category"
  | "favorite_product"
  | "favorite_color"
  | "budget"
  | "vip_level";

export type SegmentConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "between"
  | "before"
  | "after"
  | "within_last_days";

/** Shape varies by Field/Operator - see the header comment in
 * supabase/migrations/20260727_marketing_functions.sql for the exact
 * contract `marketing_match_condition()` expects. */
export type SegmentConditionValue = string | number | [number, number] | null;

export interface MarketingSegmentCondition {
  id?: string;
  segment_id?: string;
  field: SegmentConditionField;
  operator: SegmentConditionOperator;
  value: SegmentConditionValue;
  sort_order: number;
}

export interface MarketingSegment {
  id?: string;
  name: string;
  description?: string | null;
  segment_type: SegmentType;
  condition_logic?: ConditionLogic | null;
  status: SegmentStatus;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Joined - only present when fetched with the staff embed. */
  created_by_staff?: { id: string; full_name: string } | null;
}

/** A Dynamic segment with its condition set attached - the shape the
 * Segment Builder reads/writes as one unit. */
export interface MarketingSegmentWithConditions extends MarketingSegment {
  conditions: MarketingSegmentCondition[];
}

export interface MarketingSegmentMember {
  id?: string;
  segment_id: string;
  customer_id: string;
  added_by?: string | null;
  added_at?: string;
  customer?: { id: string; full_name: string; customer_code: string; phone: string } | null;
}

export type CampaignStatus = "Draft" | "Active" | "Paused" | "Completed" | "Cancelled";

export interface MarketingCampaign {
  id?: string;
  name: string;
  description?: string | null;
  target_segment_id: string;
  start_date: string;
  end_date?: string | null;
  owner_staff_id?: string | null;
  status: CampaignStatus;
  created_at?: string;
  updated_at?: string;
  /** Joined - only present when fetched with the embeds. */
  target_segment?: { id: string; name: string; status: SegmentStatus } | null;
  owner?: { id: string; full_name: string } | null;
}

export interface SegmentFilters {
  search?: string;
  segmentType?: SegmentType | "All";
  status?: SegmentStatus | "All";
  page: number;
}

export interface SegmentPage {
  rows: MarketingSegment[];
  totalCount: number;
}

export interface CampaignFilters {
  search?: string;
  status?: CampaignStatus | "All";
  ownerStaffId?: string;
  page: number;
}

export interface CampaignPage {
  rows: MarketingCampaign[];
  totalCount: number;
}

export interface SegmentPreviewResult {
  customerCount: number;
  /** V1 Product Owner Decision: always equal to customerCount. */
  estimatedReach: number;
  sampleCustomers: { id: string; customer_code: string; full_name: string; phone: string }[];
}

export interface MarketingDashboardCounts {
  segmentCount: number;
  campaignCount: number;
  birthdayToday: number;
  birthdayThisMonth: number;
  noPurchase30: number;
  noPurchase60: number;
  noPurchase90: number;
}

export type BirthdayBucket = "today" | "week" | "month";

export interface BirthdayBucketCustomer {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string;
  birthday: string;
  vip_level: string | null;
}

export interface BirthdayCenterData {
  today: BirthdayBucketCustomer[];
  thisWeek: BirthdayBucketCustomer[];
  thisMonth: BirthdayBucketCustomer[];
}

/** Campaign lifecycle (Product Owner Decision, MARKETING_SPEC.md Revision 2
 * §9): Draft -> Active -> Paused -> Active -> Completed, or Draft ->
 * Cancelled. Completed/Cancelled are terminal. */
export const CAMPAIGN_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  Draft: ["Active", "Cancelled"],
  Active: ["Paused", "Completed"],
  Paused: ["Active"],
  Completed: [],
  Cancelled: [],
};
