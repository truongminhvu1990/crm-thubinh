import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DateRange } from "@/lib/dateFilter";
import { getRevenueSummary, getTopCustomers } from "@/lib/reports/reportsBI.service";
import { getExecutiveSummary, getCustomerAnalytics } from "@/lib/businessIntelligence/businessIntelligence.service";
import { ReportsReconciliation } from "@/types/reportsReconciliation";
import { mergeReconciliation } from "./reportsReconciliation.merge";

const TOP_N = 10;

/** E-3 — Unified Revenue Reconciliation View. Both sides are read from
 * each system's own existing, unmodified function — Path A
 * (`reportsBI.service.ts`, `customer_purchases`/`sales_ledger`) and Path B
 * (`businessIntelligence.service.ts`, BR-001-gated `orders`) — called with
 * the identical `range`, per §10 field 5 ("this report's entire point
 * breaks if the two paths are allowed to use different date windows").
 * No revenue is recomputed here; the merge/comparison math itself lives in
 * reportsReconciliation.merge.ts, kept pure and separately unit-testable. */
export async function getReportsReconciliation(
  range: DateRange | null,
  client: SupabaseClient = supabase
): Promise<ReportsReconciliation> {
  const [reportsRevenueSummary, biExecutiveSummary, reportsTopCustomers, biCustomerAnalytics] = await Promise.all([
    getRevenueSummary(range, client),
    getExecutiveSummary(range, client),
    getTopCustomers(range, TOP_N, client),
    getCustomerAnalytics(range, client),
  ]);

  return mergeReconciliation(
    reportsRevenueSummary.revenue,
    biExecutiveSummary.totalRevenue,
    reportsTopCustomers.map((c) => ({
      customerId: c.customer_id,
      customerName: c.customer_name,
      customerCode: c.customer_code,
      revenue: c.period_revenue,
    })),
    biCustomerAnalytics.topCustomers.map((c) => ({
      customerId: c.customer_id,
      customerName: c.full_name,
      customerCode: c.customer_code,
      revenue: c.revenue,
    }))
  );
}
