"use client";

import Badge from "@/components/ui/Badge";
import { AutomationStatus } from "@/types/marketingAutomation";
import { AUTOMATION_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { BadgeVariant } from "@/lib/customer.constants";

/** Identical 5 values/colors to CampaignStatusBadge, reused verbatim per
 * Spec Rev.2 decision #3 (Automation reuses Campaign's locked lifecycle). */
const AUTOMATION_STATUS_BADGE_VARIANT: Record<AutomationStatus, BadgeVariant> = {
  Draft: "muted",
  Active: "success",
  Paused: "warning",
  Completed: "secondary",
  Cancelled: "destructive",
};

export default function AutomationStatusBadge({ status }: { status: AutomationStatus }) {
  const label = AUTOMATION_STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
  return <Badge variant={AUTOMATION_STATUS_BADGE_VARIANT[status]}>{label}</Badge>;
}
