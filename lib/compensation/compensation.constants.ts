import { CompensationStatus, CompensationType, CompensationBasis, CompensationMethod } from "@/types/compensation";

/** docs/13_COMPENSATION_SPEC.md §5 (Revision 4) — full 5-value status
 * model, per Product Owner Revision 2026-07-31, Decision 3 ("Support all
 * LOCKED statuses... Do not reduce the status model") — resolves §16 Q1. */
export const COMPENSATION_STATUS_OPTIONS: { value: CompensationStatus; label: string }[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Pending", label: "Chờ xử lý" },
  { value: "Confirmed", label: "Đã xác nhận" },
  { value: "Cancelled", label: "Đã hủy" },
  { value: "Handed Off", label: "Đã chuyển giao" },
];

/** §6 — starting set, none newly designed beyond Commission. */
export const COMPENSATION_TYPE_OPTIONS: { value: CompensationType; label: string }[] = [
  { value: "Commission", label: "Hoa hồng" },
  { value: "Bonus", label: "Thưởng" },
  { value: "Referral Fee", label: "Phí giới thiệu" },
  { value: "Incentive", label: "Khuyến khích" },
  { value: "Rebate", label: "Chiết khấu hoàn lại" },
];

/** §9 — starting candidate Bases, no formula designed. */
export const COMPENSATION_BASIS_OPTIONS: { value: CompensationBasis; label: string }[] = [
  { value: "Sale Price", label: "Giá bán" },
  { value: "Received Amount", label: "Số tiền đã nhận" },
  { value: "Profit", label: "Lợi nhuận" },
  { value: "Fixed Value", label: "Giá trị cố định" },
];

/** §10 — starting candidate Methods. */
export const COMPENSATION_METHOD_OPTIONS: { value: CompensationMethod; label: string }[] = [
  { value: "Percentage", label: "Phần trăm" },
  { value: "Fixed Amount", label: "Số tiền cố định" },
  { value: "Manual", label: "Thủ công" },
];

/** Compensation Policy Management (Product Owner Decision) — the two
 * calculation methods a Policy's Create/Edit form supports. A narrower list
 * than COMPENSATION_METHOD_OPTIONS on purpose: "Manual" has no calculation
 * formula (createCompensationsForOrder treats it as a 0 no-op) and was not
 * part of this decision. */
export const COMPENSATION_POLICY_METHOD_OPTIONS: { value: CompensationMethod; label: string }[] = [
  { value: "Percentage", label: "Phần trăm" },
  { value: "Fixed Amount", label: "Số tiền cố định" },
];

export const COMPENSATION_POLICY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "Active", label: "Đang áp dụng" },
  { value: "Inactive", label: "Ngừng áp dụng" },
];

export function compensationStatusLabel(status: string): string {
  return COMPENSATION_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function compensationTypeLabel(type: string): string {
  return COMPENSATION_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}
