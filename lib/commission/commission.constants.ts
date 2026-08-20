import { CommissionStatus } from "@/types/commission";
import { BadgeVariant } from "@/lib/customer.constants";

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  Pending: "Chờ duyệt",
  Approved: "Đã duyệt",
  Paid: "Đã thanh toán",
  Void: "Đã hủy (đơn hàng hủy)",
};

export const COMMISSION_STATUS_BADGE_VARIANT: Record<CommissionStatus, BadgeVariant> = {
  Pending: "muted",
  Approved: "warning",
  Paid: "success",
  Void: "destructive",
};

export const COMMISSION_STATUS_OPTIONS: { value: CommissionStatus; label: string }[] = [
  { value: "Pending", label: COMMISSION_STATUS_LABEL.Pending },
  { value: "Approved", label: COMMISSION_STATUS_LABEL.Approved },
  { value: "Paid", label: COMMISSION_STATUS_LABEL.Paid },
  { value: "Void", label: COMMISSION_STATUS_LABEL.Void },
];

/** Feature 5 - the only allowed forward transition from each status. Pending
 * cannot skip straight to Paid. There is no backward/reject transition -
 * not named anywhere in the locked business rules. Void (Compensation/
 * Commission Void, 2026-08-20) is only ever reached by cancel_order_with_
 * disposition's own RPC-level UPDATE, never through this app-level
 * next-status machine - terminal here too (null), same as Paid. */
export const COMMISSION_NEXT_STATUS: Record<CommissionStatus, CommissionStatus | null> = {
  Pending: "Approved",
  Approved: "Paid",
  Paid: null,
  Void: null,
};
