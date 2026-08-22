import { SupabaseClient } from "@supabase/supabase-js";
import { CustomerReceivableFilters, CustomerReceivablePage, CUSTOMER_RECEIVABLE_PAGE_SIZE } from "@/types/customerReceivable";
import { Staff } from "@/types/staff";
import * as repo from "./customerReceivable.repository";

/** Business logic / composition only - CustomerReceivableRepository owns
 * every direct Supabase call. Summary totals (totalOutstanding/
 * totalOverpaid) are always computed over the FULL filtered set, never
 * just the current page, so they can never disagree with what paging
 * through every page would add up to - the same reasoning
 * getMonthlySoldProductsSummary's own page/summary split already follows. */
export async function getCustomerReceivablePage(
  filters: CustomerReceivableFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<CustomerReceivablePage> {
  const allRows = await repo.findCustomerReceivableOrders(filters, client, staff);

  const totalOutstanding = allRows
    .filter((r) => r.settlementState === "Outstanding")
    .reduce((sum, r) => sum + r.remainingBalance, 0);
  const totalOverpaid = allRows
    .filter((r) => r.settlementState === "Overpaid")
    .reduce((sum, r) => sum + r.overpaidAmount, 0);

  const page = filters.page ?? 1;
  const start = (page - 1) * CUSTOMER_RECEIVABLE_PAGE_SIZE;
  const rows = allRows.slice(start, start + CUSTOMER_RECEIVABLE_PAGE_SIZE);

  return {
    rows,
    totalCount: allRows.length,
    summary: { totalOutstanding, totalOverpaid, orderCount: allRows.length },
  };
}
