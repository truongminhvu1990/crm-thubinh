// Marketing Automation (Sprint v3.1.0). See docs/MARKETING_AUTOMATION_SPEC.md,
// docs/MARKETING_AUTOMATION_DATABASE.md (both Revision 2, LOCKED), and
// docs/MARKETING_AUTOMATION_UI.md (Revision 1, LOCKED). Kept as its own file
// (not appended to types/marketing.ts, Marketing Foundation's locked type
// file) since this is a distinct, additive module reading Foundation types,
// not redesigning them.

import { MarketingCampaign } from "./marketing";

export type AutomationType =
  | "Birthday Greeting"
  | "Welcome Customer"
  | "No Purchase 30 Days"
  | "No Purchase 60 Days"
  | "No Purchase 90 Days"
  | "VIP Upgrade"
  | "Manual Broadcast";

export type AutomationTriggerType = "Manual" | "Daily Schedule";
export type AutomationFrequency = "Once" | "Daily" | "Weekly" | "Monthly";
export type AutomationStatus = "Draft" | "Active" | "Paused" | "Completed" | "Cancelled";

export interface MarketingAutomation {
  id?: string;
  name: string;
  description?: string | null;
  automation_type: AutomationType;
  trigger_type: AutomationTriggerType;
  frequency: AutomationFrequency;
  target_segment_id: string;
  status: AutomationStatus;
  version: number;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Joined - only present when fetched with the embeds. */
  target_segment?: { id: string; name: string; status: string } | null;
  created_by_staff?: { id: string; full_name: string } | null;
}

/** Reuses Marketing Foundation's locked Campaign lifecycle as-is (Spec Rev.2
 * decision #3) - Draft -> Active -> Paused -> Active -> Completed, or
 * Draft -> Cancelled, both terminal. Cancel also allowed from Active/Paused,
 * same disclosed judgment call as CAMPAIGN_STATUS_TRANSITIONS. */
export const AUTOMATION_STATUS_TRANSITIONS: Record<AutomationStatus, AutomationStatus[]> = {
  Draft: ["Active", "Cancelled"],
  Active: ["Paused", "Completed", "Cancelled"],
  Paused: ["Active", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

export type AutomationRunStatus = "Pending" | "Running" | "Success" | "Failed" | "Cancelled";

export interface MarketingAutomationRun {
  id?: string;
  automation_id: string;
  triggered_by: AutomationTriggerType;
  started_at?: string;
  finished_at?: string | null;
  duration_ms?: number | null;
  status: AutomationRunStatus;
  error_message?: string | null;
  created_at?: string;
  /** Joined - only present when fetched with the embed. */
  automation?: { id: string; name: string; automation_type: AutomationType } | null;
}

export type AutomationLogResult = "Pending" | "Success" | "Failed";

export interface MarketingAutomationLog {
  id?: string;
  run_id: string;
  customer_id: string;
  result: AutomationLogResult;
  message?: string | null;
  created_at?: string;
  /** Joined - only present when fetched with the embed. */
  customer?: { id: string; full_name: string; customer_code: string } | null;
}

export interface MarketingCampaignAutomation {
  id?: string;
  campaign_id: string;
  automation_id: string;
  linked_by?: string | null;
  linked_at?: string;
  /** Joined - only present when fetched with the embed. */
  campaign?: Pick<MarketingCampaign, "id" | "name" | "status"> | null;
  automation?: Pick<MarketingAutomation, "id" | "name" | "automation_type"> | null;
}

export type LoyaltyRuleStatus = "Active" | "Inactive";

export interface MarketingLoyaltyRule {
  id?: string;
  name: string;
  description?: string | null;
  points_value: number;
  status: LoyaltyRuleStatus;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type LoyaltyTransactionType = "Earn" | "Adjust" | "Expire";

export interface MarketingLoyaltyTransaction {
  id?: string;
  customer_id: string;
  rule_id?: string | null;
  transaction_type: LoyaltyTransactionType;
  points: number;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
  /** Joined - only present when fetched with the embeds. */
  customer?: { id: string; full_name: string; customer_code: string } | null;
  rule?: { id: string; name: string } | null;
}

export type VoucherStatus = "Draft" | "Active" | "Expired" | "Disabled";

export interface MarketingVoucher {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  status: VoucherStatus;
  customer_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  expires_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Joined - only present when fetched with the embed. */
  customer?: { id: string; full_name: string; customer_code: string } | null;
}

export interface AutomationFilters {
  search?: string;
  status?: AutomationStatus | "All";
  automationType?: AutomationType | "All";
  frequency?: AutomationFrequency | "All";
  triggerType?: AutomationTriggerType | "All";
  page: number;
}

export interface AutomationPage {
  rows: (MarketingAutomation & { lastRun?: MarketingAutomationRun | null })[];
  totalCount: number;
}

export interface AutomationRunFilters {
  automationId?: string;
  status?: AutomationRunStatus | "All";
  page: number;
}

export interface AutomationRunPage {
  rows: MarketingAutomationRun[];
  totalCount: number;
}

export interface AutomationDashboardCounts {
  totalAutomations: number;
  activeAutomations: number;
  pausedAutomations: number;
  todaysRuns: number;
  failedRunsToday: number;
}

export interface AutomationExecutionStats {
  totalRuns: number;
  successRate: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface VoucherFilters {
  search?: string;
  status?: VoucherStatus | "All";
  page: number;
}

export interface VoucherPage {
  rows: MarketingVoucher[];
  totalCount: number;
}

export interface LoyaltyTransactionFilters {
  customerId?: string;
  transactionType?: LoyaltyTransactionType | "All";
  page: number;
}

export interface LoyaltyTransactionPage {
  rows: MarketingLoyaltyTransaction[];
  totalCount: number;
}

export interface CustomerLoyaltyBalance {
  balance: number;
  earnedTotal: number;
  adjustedTotal: number;
  expiredTotal: number;
}
