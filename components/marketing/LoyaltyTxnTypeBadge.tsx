"use client";

import Badge from "@/components/ui/Badge";
import { LoyaltyTransactionType } from "@/types/marketingAutomation";
import { LOYALTY_TXN_TYPE_OPTIONS } from "@/lib/marketing/marketing.constants";
import { BadgeVariant } from "@/lib/customer.constants";

const LOYALTY_TXN_TYPE_BADGE_VARIANT: Record<LoyaltyTransactionType, BadgeVariant> = {
  Earn: "success",
  Adjust: "warning",
  Expire: "destructive",
};

export default function LoyaltyTxnTypeBadge({ type }: { type: LoyaltyTransactionType }) {
  const label = LOYALTY_TXN_TYPE_OPTIONS.find((o) => o.value === type)?.label || type;
  return <Badge variant={LOYALTY_TXN_TYPE_BADGE_VARIANT[type]}>{label}</Badge>;
}
