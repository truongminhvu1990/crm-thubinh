import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ReportColumnPreference, ReportKey } from "@/types/reportPreferences";

interface ReportColumnPreferenceRow {
  report_key: ReportKey;
  visible_columns: string[];
  column_order?: string[] | null;
  updated_at: string;
}

const COLUMNS_WITH_ORDER = "report_key, visible_columns, column_order, updated_at";
const COLUMNS_LEGACY = "report_key, visible_columns, updated_at";

function toPreference(row: ReportColumnPreferenceRow): ReportColumnPreference {
  return {
    reportKey: row.report_key,
    visibleColumns: row.visible_columns,
    columnOrder: Array.isArray(row.column_order) ? row.column_order : null,
    updatedAt: row.updated_at,
  };
}

/** Rollout safety net (Wave B0): Production has no `column_order` until migration 2026100402 is applied. The code must
 * keep working in that window, so a "column does not exist" error falls back to the legacy shape. */
export function isMissingColumnOrderError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column_order/i.test(error.message ?? "");
}

/** One staff member's saved preference for one report, or null if they have never saved one - null is a meaningful,
 * distinct state (no saved preference -> registry defaults), never coerced to an empty array. */
export async function getColumnPreference(
  staffId: string,
  reportKey: ReportKey,
  client: SupabaseClient = supabase
): Promise<ReportColumnPreference | null> {
  const run = (cols: string) =>
    client.from("report_column_preferences").select(cols).eq("staff_id", staffId).eq("report_key", reportKey).maybeSingle();

  let { data, error } = await run(COLUMNS_WITH_ORDER);
  if (isMissingColumnOrderError(error)) ({ data, error } = await run(COLUMNS_LEGACY));

  if (error) {
    console.error("Error fetching report column preference:", error);
    return null;
  }
  return data ? toPreference(data as unknown as ReportColumnPreferenceRow) : null;
}

/** Upsert on the (staff_id, report_key) unique constraint - a user always has at most one saved preference per report.
 * `columnOrder` null (legacy callers) is stored as NULL = legacy semantics. */
export async function saveColumnPreference(
  staffId: string,
  reportKey: ReportKey,
  visibleColumns: string[],
  client: SupabaseClient = supabase,
  columnOrder: string[] | null = null
): Promise<ReportColumnPreference> {
  const run = (row: Record<string, unknown>, cols: string) =>
    client.from("report_column_preferences").upsert(row, { onConflict: "staff_id,report_key" }).select(cols).single();

  const base = { staff_id: staffId, report_key: reportKey, visible_columns: visibleColumns };
  let { data, error } = await run({ ...base, column_order: columnOrder }, COLUMNS_WITH_ORDER);
  if (isMissingColumnOrderError(error)) ({ data, error } = await run(base, COLUMNS_LEGACY));

  if (error) {
    console.error("Error saving report column preference:", error);
    throw error;
  }
  return toPreference(data as unknown as ReportColumnPreferenceRow);
}

/** Reset = delete the caller's row (idempotent: deleting nothing is success). RLS limits it to the caller's own row. */
export async function deleteColumnPreference(
  staffId: string,
  reportKey: ReportKey,
  client: SupabaseClient = supabase
): Promise<void> {
  const { error } = await client.from("report_column_preferences").delete().eq("staff_id", staffId).eq("report_key", reportKey);
  if (error) {
    console.error("Error deleting report column preference:", error);
    throw error;
  }
}
