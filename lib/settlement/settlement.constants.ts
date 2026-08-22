import { SettlementStatus, SettlementMethod } from "@/types/settlement";

/** docs/14_SETTLEMENT_SPEC.md §5 — LOCKED as exactly these five values. */
export const SETTLEMENT_STATUS_OPTIONS: { value: SettlementStatus; label: string }[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Pending", label: "Chờ duyệt" },
  { value: "Approved", label: "Đã duyệt" },
  { value: "Completed", label: "Hoàn tất" },
  { value: "Paid", label: "Đã thanh toán" },
  { value: "Cancelled", label: "Đã hủy" },
];

/** §7 — starting candidate Methods, business-configurable. */
export const SETTLEMENT_METHOD_OPTIONS: { value: SettlementMethod; label: string }[] = [
  { value: "Bank Transfer", label: "Chuyển khoản" },
  { value: "Cash", label: "Tiền mặt" },
  { value: "Internal Balance", label: "Số dư nội bộ" },
];

export function settlementStatusLabel(status: string): string {
  return SETTLEMENT_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}
