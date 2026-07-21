import { CommissionStatus } from "@/types/commission";
import { BadgeVariant } from "@/lib/customer.constants";

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  Pending: "Chờ duyệt",
  Approved: "Đã duyệt",
  Paid: "Đã thanh toán",
};

export const COMMISSION_STATUS_BADGE_VARIANT: Record<CommissionStatus, BadgeVariant> = {
  Pending: "muted",
  Approved: "warning",
  Paid: "success",
};

export const COMMISSION_STATUS_OPTIONS: { value: CommissionStatus; label: string }[] = [
  { value: "Pending", label: COMMISSION_STATUS_LABEL.Pending },
  { value: "Approved", label: COMMISSION_STATUS_LABEL.Approved },
  { value: "Paid", label: COMMISSION_STATUS_LABEL.Paid },
];

/** Feature 5 - the only allowed forward transition from each status. Pending
 * cannot skip straight to Paid. There is no backward/reject transition -
 * not named anywhere in the locked business rules. */
export const COMMISSION_NEXT_STATUS: Record<CommissionStatus, CommissionStatus | null> = {
  Pending: "Approved",
  Approved: "Paid",
  Paid: null,
};
