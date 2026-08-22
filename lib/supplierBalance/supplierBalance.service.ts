import { SupabaseClient } from "@supabase/supabase-js";
import { SupplierBalanceFilters, SupplierBalancePage } from "@/types/supplierBalance";
import * as repo from "./supplierBalance.repository";

/** Business logic / composition only - SupplierBalanceRepository owns
 * every direct Supabase call. No cross-currency total is ever computed
 * here (or anywhere in this module) - summing VND and CNY together would
 * be meaningless, so the summary only counts suppliers/rows, never sums
 * `balance` across currencies. */
export async function getSupplierBalancePage(
  filters: SupplierBalanceFilters,
  client?: SupabaseClient
): Promise<SupplierBalancePage> {
  const rows = await repo.findSupplierBalances(filters, client);
  const supplierCount = new Set(rows.map((r) => r.partyId)).size;

  return {
    rows,
    summary: { supplierCount, rowCount: rows.length },
  };
}
