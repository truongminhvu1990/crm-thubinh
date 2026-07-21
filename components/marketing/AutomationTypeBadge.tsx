"use client";

import Badge from "@/components/ui/Badge";
import { AutomationType } from "@/types/marketingAutomation";
import { AUTOMATION_TYPE_OPTIONS } from "@/lib/marketing/marketing.constants";
import { BadgeVariant } from "@/lib/customer.constants";

const AUTOMATION_TYPE_BADGE_VARIANT: Record<AutomationType, BadgeVariant> = {
  "Birthday Greeting": "vip",
  "Welcome Customer": "success",
  "No Purchase 30 Days": "warning",
  "No Purchase 60 Days": "warning",
  "No Purchase 90 Days": "destructive",
  "VIP Upgrade": "vip",
  "Manual Broadcast": "default",
};

export default function AutomationTypeBadge({ type }: { type: AutomationType }) {
  const label = AUTOMATION_TYPE_OPTIONS.find((o) => o.value === type)?.label || type;
  return <Badge variant={AUTOMATION_TYPE_BADGE_VARIANT[type]}>{label}</Badge>;
}
