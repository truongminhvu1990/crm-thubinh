"use client";

import Badge from "@/components/ui/Badge";
import { CampaignStatus } from "@/types/marketing";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { BadgeVariant } from "@/lib/customer.constants";

/** Same mapping convention as CUSTOMER_STATUS_BADGE_VARIANT
 * (lib/customer.constants.ts) - color by status, text always present
 * (never color alone), per MARKETING_UI.md §15 Accessibility Notes. */
const CAMPAIGN_STATUS_BADGE_VARIANT: Record<CampaignStatus, BadgeVariant> = {
  Draft: "muted",
  Active: "success",
  Paused: "warning",
  Completed: "secondary",
  Cancelled: "destructive",
};

export default function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const label = CAMPAIGN_STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
  return <Badge variant={CAMPAIGN_STATUS_BADGE_VARIANT[status]}>{label}</Badge>;
}
