import { Partner } from "@/types/partner";
import { toCsv } from "./csv";
import { partnerStatusLabel, partnerTypeLabel } from "./partner/partner.constants";

/** Export only (no import) — the task's own Acceptance Checklist asks for
 * CSV export, not a round-trip import. Mirrors lib/customerImportExport.ts's
 * exportCustomersToCsv shape. */
export const PARTNER_CSV_HEADER = [
  "Mã đối tác",
  "Tên",
  "Loại đối tác",
  "Điện thoại",
  "Email",
  "Trạng thái",
  "Ngày tạo",
];

export function exportPartnersToCsv(partners: Partner[]): string {
  const rows: (string | number)[][] = [
    PARTNER_CSV_HEADER,
    ...partners.map((p) => [
      p.partner_code,
      p.name,
      partnerTypeLabel(p.partner_type),
      p.phone ?? "",
      p.email ?? "",
      partnerStatusLabel(p.status),
      p.created_at ? p.created_at.slice(0, 10) : "",
    ]),
  ];
  return toCsv(rows);
}
