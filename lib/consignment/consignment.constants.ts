import { ConsignmentStatus } from "@/types/consignment";

/** D02/D01, LOCKED — RECEIVED/AVAILABLE_FOR_SALE/SOLD/RETURNED only, no
 * CANCELLED this phase. */
export const CONSIGNMENT_STATUS_OPTIONS: { value: ConsignmentStatus; label: string }[] = [
  { value: "RECEIVED", label: "Đã nhận" },
  { value: "AVAILABLE_FOR_SALE", label: "Sẵn sàng bán" },
  { value: "SOLD", label: "Đã bán" },
  { value: "RETURNED", label: "Đã trả" },
];

export function consignmentStatusLabel(status: string): string {
  return CONSIGNMENT_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}
