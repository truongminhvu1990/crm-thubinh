import { PartnerStatus, PartnerType } from "@/types/partner";

/** docs/12_PARTNER_CENTER_SPEC.md §5 — confirmed by Product Owner
 * Implementation Task 2026-07-31. Not a DB CHECK constraint (Extensibility
 * principle) — this is the one place the allowed set is enforced. */
export const PARTNER_STATUS_OPTIONS: { value: PartnerStatus; label: string }[] = [
  { value: "Onboarding", label: "Đang thiết lập" },
  { value: "Active", label: "Đang hoạt động" },
  { value: "Inactive", label: "Tạm ngưng" },
  { value: "Terminated", label: "Đã chấm dứt" },
];

/** §6 — starting set, explicitly "not assumed final" in the LOCKED spec. */
export const PARTNER_TYPE_OPTIONS: { value: PartnerType; label: string }[] = [
  { value: "Collaborator", label: "Cộng tác viên" },
  { value: "Sales Agent", label: "Đại lý bán hàng" },
  { value: "Dealer", label: "Nhà phân phối" },
  { value: "Affiliate", label: "Đối tác liên kết" },
  { value: "Referral Partner", label: "Đối tác giới thiệu" },
];

export function partnerStatusLabel(status: string): string {
  return PARTNER_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function partnerTypeLabel(type: string): string {
  return PARTNER_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}
