import { REPORT_COLUMNS, isReportKey, ReportColumnKey } from "@/lib/reportColumns/registry";

export const MAX_BODY_BYTES = 4096;
export const MAX_COLUMNS = 64;
const COLUMN_KEY = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

export type Validated =
  | { ok: true; reportKey: ReportColumnKey; visibleColumns: string[]; columnOrder: string[] | null | undefined }
  | { ok: false; status: number; code: string; error: string; keys?: string[] };

const fail = (status: number, code: string, error: string, keys?: string[]): Validated => ({ ok: false, status, code, error, keys });

function checkKeys(reportKey: ReportColumnKey, arr: unknown, field: string): string[] | Validated {
  if (!Array.isArray(arr)) return fail(400, "INVALID_PAYLOAD", `${field} must be a string array`);
  if (arr.length > MAX_COLUMNS) return fail(400, "TOO_MANY_COLUMNS", `${field} has more than ${MAX_COLUMNS} entries`);
  const seen = new Set<string>();
  const known = new Set<string>(REPORT_COLUMNS[reportKey].map((c) => c.key));
  const unknown: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string" || !COLUMN_KEY.test(v)) return fail(400, "INVALID_PAYLOAD", `${field} must contain valid column keys`);
    if (seen.has(v)) return fail(400, "DUPLICATE_COLUMN", `${field} contains a duplicate column key`, [v]);
    seen.add(v);
    if (!known.has(v)) unknown.push(v);
  }
  if (unknown.length) return fail(400, "UNKNOWN_COLUMN", `${field} contains columns not in this report`, unknown);
  return arr as string[];
}

/** Pure validation of a PUT body. `staff_id` is intentionally never read: any such field in the body is ignored. Keys
 * are checked against the WHOLE report registry (including permission-gated columns, which the user may have stored
 * earlier). Mandatory columns are added to visibleColumns only for the new format (columnOrder provided); a legacy
 * payload (no columnOrder) is stored exactly as sent so existing tables behave as before. */
export function validatePutPayload(body: unknown): Validated {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "INVALID_PAYLOAD", "Body must be a JSON object");
  const b = body as Record<string, unknown>;
  if (!isReportKey(b.reportKey)) return fail(400, "INVALID_REPORT_KEY", "Invalid or missing reportKey");
  const reportKey = b.reportKey;

  const visible = checkKeys(reportKey, b.visibleColumns, "visibleColumns");
  if (!Array.isArray(visible)) return visible;

  if (b.columnOrder === undefined || b.columnOrder === null) {
    return { ok: true, reportKey, visibleColumns: visible, columnOrder: b.columnOrder === null ? null : undefined };
  }
  const order = checkKeys(reportKey, b.columnOrder, "columnOrder");
  if (!Array.isArray(order)) return order;

  const withMandatory = [...visible];
  for (const col of REPORT_COLUMNS[reportKey] as readonly { key: string; mandatory?: boolean }[]) {
    if (col.mandatory && !withMandatory.includes(col.key)) withMandatory.push(col.key);
  }
  return { ok: true, reportKey, visibleColumns: withMandatory, columnOrder: order };
}
