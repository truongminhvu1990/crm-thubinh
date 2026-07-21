"use client";

import Badge from "@/components/ui/Badge";
import { VoucherStatus } from "@/types/marketingAutomation";
import { VOUCHER_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { BadgeVariant } from "@/lib/customer.constants";

const VOUCHER_STATUS_BADGE_VARIANT: Record<VoucherStatus, BadgeVariant> = {
  Draft: "muted",
  Active: "success",
  Expired: "secondary",
  Disabled: "destructive",
};

export default function VoucherStatusBadge({ status }: { status: VoucherStatus }) {
  const label = VOUCHER_STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
  return <Badge variant={VOUCHER_STATUS_BADGE_VARIANT[status]}>{label}</Badge>;
}
