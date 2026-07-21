"use client";

import Badge from "@/components/ui/Badge";
import { AutomationRunStatus } from "@/types/marketingAutomation";
import { RUN_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { BadgeVariant } from "@/lib/customer.constants";

const RUN_STATUS_BADGE_VARIANT: Record<AutomationRunStatus, BadgeVariant> = {
  Pending: "muted",
  Running: "default",
  Success: "success",
  Failed: "destructive",
  Cancelled: "secondary",
};

export default function AutomationRunStatusBadge({ status }: { status: AutomationRunStatus }) {
  const label = RUN_STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
  return <Badge variant={RUN_STATUS_BADGE_VARIANT[status]}>{label}</Badge>;
}
