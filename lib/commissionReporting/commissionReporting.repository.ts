import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DateRange } from "@/lib/dateFilter";
import { Staff } from "@/types/staff";
import { CommissionBySalespersonRow, CommissionAgingRow } from "@/types/commissionReporting";
import { applyDataScopeWithFallback } from "@/lib/permission/dataScope";
import { RawCommissionRow, aggregateCommissionBySalesperson, computeCommissionAging } from "./commissionReporting.service";

// Raw data access only, direct against `sales_commissions` - the exact
// table Commission's own commission.repository.ts also reads, but this
// module never imports from lib/commission/ (docs/07_REPORTING_SPEC.md §8,
// Decision 2: "Reporting must never call Commission's own service"). Every
// query below applies the same "commissions" Data Scope resource
// (salesperson_id/salesperson uuid+text fallback) already configured in
// Permission Center for this table - reused, not invented. Aggregation
// math itself lives in commissionReporting.service.ts, kept pure and
// separately unit-testable.

const SELECT_COLUMNS = "id, salesperson, salesperson_id, sale_amount, commission_amount, status, created_at";

/** ST-3 - Commission by Salesperson. `range: null` means all-time, matching
 * every other Reporting projection's own convention. */
export async function getCommissionBySalesperson(
  range: DateRange | null,
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<CommissionBySalespersonRow[]> {
  let query = client.from("sales_commissions").select(SELECT_COLUMNS);
  if (range) {
    query = query.gte("created_at", range.start).lt("created_at", range.end);
  }
  if (staff) {
    query = (await applyDataScopeWithFallback(query, staff, "commissions", "salesperson_id", "salesperson")).query;
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching commission-by-salesperson rows:", error);
    return [];
  }

  return aggregateCommissionBySalesperson((data ?? []) as RawCommissionRow[]);
}

/** ST-4 - Commission Aging. "How long a Commission has sat Pending without
 * Approval" (docs/06_COMMISSION_SPEC.md §16) - current-state, not
 * date-ranged (same "point-in-time" shape as I-1's own Product breakdown),
 * so every currently-Pending commission is included regardless of when it
 * was created. */
export async function getCommissionAging(
  client: SupabaseClient = supabase,
  staff?: Staff | null
): Promise<CommissionAgingRow[]> {
  let query = client.from("sales_commissions").select(SELECT_COLUMNS).eq("status", "Pending");
  if (staff) {
    query = (await applyDataScopeWithFallback(query, staff, "commissions", "salesperson_id", "salesperson")).query;
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching commission aging rows:", error);
    return [];
  }

  return computeCommissionAging((data ?? []) as RawCommissionRow[]);
}
