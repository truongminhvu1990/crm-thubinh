import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ReportColumnPreference, ReportKey } from "@/types/reportPreferences";

interface ReportColumnPreferenceRow {
  report_key: ReportKey;
  visible_columns: string[];
  updated_at: string;
}

function toPreference(row: ReportColumnPreferenceRow): ReportColumnPreference {
  return { reportKey: row.report_key, visibleColumns: row.visible_columns, updatedAt: row.updated_at };
}

/** One staff member's saved preference for one report, or null if they've
 * never saved one — null is a meaningful, distinct state (§15: "no saved
 * preference" -> all currently-available columns visible), never coerced
 * to an empty array. */
export async function getColumnPreference(
  staffId: string,
  reportKey: ReportKey,
  client: SupabaseClient = supabase
): Promise<ReportColumnPreference | null> {
  const { data, error } = await client
    .from("report_column_preferences")
    .select("report_key, visible_columns, updated_at")
    .eq("staff_id", staffId)
    .eq("report_key", reportKey)
    .maybeSingle();

  if (error) {
    console.error("Error fetching report column preference:", error);
    return null;
  }
  return data ? toPreference(data as ReportColumnPreferenceRow) : null;
}

/** Upsert on the (staff_id, report_key) unique constraint — a user always
 * has at most one saved preference per report; saving again replaces it
 * rather than accumulating rows. */
export async function saveColumnPreference(
  staffId: string,
  reportKey: ReportKey,
  visibleColumns: string[],
  client: SupabaseClient = supabase
): Promise<ReportColumnPreference> {
  const { data, error } = await client
    .from("report_column_preferences")
    .upsert(
      { staff_id: staffId, report_key: reportKey, visible_columns: visibleColumns },
      { onConflict: "staff_id,report_key" }
    )
    .select("report_key, visible_columns, updated_at")
    .single();

  if (error) {
    console.error("Error saving report column preference:", error);
    throw error;
  }
  return toPreference(data as ReportColumnPreferenceRow);
}
