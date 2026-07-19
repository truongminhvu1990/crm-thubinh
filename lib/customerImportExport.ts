import { Customer } from "@/types/customer";
import { toCsv, parseCsv } from "./csv";

/** Profile/demographic/business fields only - notes (JSON-serialized timeline)
 * and last_contacted (system-managed) are intentionally excluded from
 * import/export so a spreadsheet round-trip can't corrupt them. */
export const CUSTOMER_CSV_FIELDS: (keyof Customer)[] = [
  "customer_code",
  "full_name",
  "phone",
  "facebook",
  "zalo",
  "birthday",
  "address",
  "vip_level",
  "source",
  "gender",
  "occupation",
  "country",
  "province",
  "district",
  "wrist_size",
  "ring_size",
  "favorite_type",
  "favorite_color",
  "preferred_origin",
  "budget",
  "purpose",
  "assigned_salesperson",
  "last_viewed_product",
];

export function exportCustomersToCsv(customers: Customer[]): string {
  const rows: (string | number)[][] = [
    CUSTOMER_CSV_FIELDS,
    ...customers.map((c) => CUSTOMER_CSV_FIELDS.map((field) => c[field] ?? "")),
  ];
  return toCsv(rows);
}

export interface ParsedCustomerRow {
  rowNumber: number;
  data: Partial<Customer>;
  errors: string[];
}

/** Parses a CSV exported by `exportCustomersToCsv` (or any CSV whose header
 * row uses the same field names). Unknown columns are ignored; missing
 * columns are left unset. Row numbers are 1-indexed and count the header
 * row, matching what a user sees when opening the file in a spreadsheet
 * app. */
export function parseCustomersCsv(text: string): ParsedCustomerRow[] {
  const rows = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const knownFields = new Set<string>(CUSTOMER_CSV_FIELDS);

  return rows.slice(1).map((row, i) => {
    const data: Partial<Customer> = {};
    header.forEach((key, colIndex) => {
      if (!knownFields.has(key)) return;
      const value = (row[colIndex] ?? "").trim();
      if (value !== "") (data as Record<string, string>)[key] = value;
    });

    const errors: string[] = [];
    if (!data.full_name) errors.push("Thiếu họ tên");
    if (!data.phone) errors.push("Thiếu số điện thoại");

    return { rowNumber: i + 2, data, errors };
  });
}
