import { ConsignmentSettlementStatus, ConsignmentSettlementMethod } from "@/types/consignmentSettlement";

/** D8/D03, LOCKED — mirrors Settlement's own 5-value status model exactly
 * (docs/14_SETTLEMENT_SPEC.md §5), for the pattern-extension this
 * capability is built on. */
export const CONSIGNMENT_SETTLEMENT_STATUS_OPTIONS: { value: ConsignmentSettlementStatus; label: string }[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Pending", label: "Chờ duyệt" },
  { value: "Approved", label: "Đã duyệt" },
  { value: "Completed", label: "Hoàn tất" },
  { value: "Cancelled", label: "Đã hủy" },
];

export const CONSIGNMENT_SETTLEMENT_METHOD_OPTIONS: { value: ConsignmentSettlementMethod; label: string }[] = [
  { value: "Bank Transfer", label: "Chuyển khoản" },
  { value: "Cash", label: "Tiền mặt" },
  { value: "Internal Balance", label: "Số dư nội bộ" },
];

export function consignmentSettlementStatusLabel(status: string): string {
  return CONSIGNMENT_SETTLEMENT_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}
