import { SupabaseClient } from "@supabase/supabase-js";
import {
  MonthlySoldProductsFilters,
  MonthlySoldProductRow,
  MonthlySoldProductsSummary,
} from "@/types/monthlySoldProducts";
import { Staff } from "@/types/staff";
import { getCurrentStaff } from "@/lib/permission";
import { resolveRoleForStaff } from "@/lib/permission/permissionCenter.service";
import { getOperatingExpensesTotal } from "@/lib/operatingExpenses/operatingExpenses.service";
import { getAccrualCommissionExpense } from "@/lib/reports/commissionExpense";
import * as repo from "./monthlySoldProducts.repository";

// Business logic / composition only - MonthlySoldProductsRepository owns
// every direct Supabase call. Nothing here recomputes sale_amount; it only
// gates Gross Profit visibility and aggregates already-derived fields into
// the Summary.

/** Gross Profit ("if available" per the brief) is only ever shown to
 * Owner/Manager - same fixed role check the Sales Ledger table's own
 * Cost/Profit column already uses (lib/hooks/useIsOwnerOrManager.ts). Here
 * it's enforced server-side (not just hidden in the UI) so the figure never
 * leaves the server for an unpermitted viewer.
 *
 * `staff` sentinel semantics match the repository's own applyFilters:
 * `undefined` (every browser-side caller, e.g. the page's Export handler)
 * means "resolve the signed-in staff yourself" (Browser Authentication
 * Context); an explicit `Staff | null` means "use this value, already
 * resolved" - what app/api/reports/monthly-sold-products/route.ts passes,
 * using the Server Authentication Context. */
async function canViewCostAndProfit(staff?: Staff | null, client?: SupabaseClient): Promise<boolean> {
  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  if (!resolvedStaff) return false;
  const role = await resolveRoleForStaff(resolvedStaff, client);
  return role?.role_key === "Owner" || role?.role_key === "Manager";
}

export async function getMonthlySoldProductsPage(
  filters: MonthlySoldProductsFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<{ rows: MonthlySoldProductRow[]; totalCount: number }> {
  const { rows, totalCount } = await repo.getMonthlySoldProductsPage(filters, client, staff);
  const permitted = await canViewCostAndProfit(staff, client);
  const guardedRows = permitted ? rows : rows.map((r) => ({ ...r, gross_profit: null }));
  return { rows: guardedRows, totalCount };
}

/** Summary, computed over every currently-filtered row (not just the
 * visible page). Total Revenue applies BR-001/BR-002 Revenue Recognition
 * (LOCKED) via the sales_ledger view's own `is_revenue_recognized` column -
 * the same rule Sales Ledger's summary already applies, reused here rather
 * than redefined. Total Orders groups rows by their linked Order
 * (order_item_id -> order_items.order_id) where one exists; a row with no
 * linked Order (manual/historical entry) is counted as its own single-item
 * "order," since it represents one standalone sale with no Order to group it
 * under - unchanged from this report's pre-existing Average Order Value
 * denominator logic. Total Customers is a distinct count over the same
 * filtered set.
 *
 * Profit/Loss = Total Revenue − Product Cost − Partner Compensation −
 * Staff Commission − Operating Expenses (Finance Project #1, Phase D,
 * Product Owner Approval 2026-08-21 — extends the original 2026-07-28
 * "Report Calculation," which never subtracted commission). Both
 * commission sources are accrual-basis (lib/reports/commissionExpense.ts:
 * counted once earned/confirmed, independent of Paid/Unpaid — Paid state
 * only affects payable/cash-flow reporting elsewhere, never this figure)
 * and scoped to the SAME order_id/purchase_id set as this function's own
 * recognized Revenue rows, so an expense is never deducted for a sale this
 * report doesn't also count as Revenue. Partner Compensation and Staff
 * Commission remain two separate systems, queried independently — no
 * schema merge, no new ledger; this is a reporting-layer aggregation only.
 * Product Cost sums
 * products.cost_price only for revenue-recognized rows (mirrors Total
 * Revenue's own gate - subtracting cost for a sale whose revenue wasn't
 * counted would corrupt the figure) and only where cost_price is known
 * (unknown cost contributes 0, same "if available" treatment as this
 * report's own Gross Profit column). Operating Expenses is the period's
 * total from the new Expense Management module, filtered by date range only
 * (no salesperson/category/customer dimension - it's a period-level cost).
 * Profit Margin (%) = Profit/Loss ÷ Total Revenue × 100. `cogs` is this same
 * `productCost` value, exposed as its own field (Financial Summary
 * enhancement, Product Owner Decision, 2026-07-28) - computed once here and
 * reused for both `cogs` and the `profitLoss` formula, never recomputed
 * twice.
 *
 * cogs/profitLoss/profitMargin are gated to the same Owner/Manager-only
 * visibility this report's Gross Profit column already uses
 * (canViewCostAndProfit) - all three are cost-derived figures, so this
 * reuses that existing rule rather than inventing a new one. Total Revenue/
 * Customers/Orders/Operating Expenses stay visible to everyone, unchanged. */
export async function getMonthlySoldProductsSummary(
  filters: MonthlySoldProductsFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<MonthlySoldProductsSummary> {
  const { source, derivedByPurchaseId } = await repo.getMonthlySoldProductsAggregateRows(filters, client, staff);

  const totalRevenue = source.reduce(
    (sum, r) => sum + (r.is_revenue_recognized ? Number(r.sale_amount) || 0 : 0),
    0
  );

  const totalCustomers = new Set(source.map((r) => r.customer_id)).size;

  const distinctOrderIds = new Set<string>();
  let singletonCount = 0;
  for (const r of source) {
    const orderId = derivedByPurchaseId.get(r.purchase_id)?.order_id ?? null;
    if (orderId) distinctOrderIds.add(orderId);
    else singletonCount += 1;
  }
  const totalOrders = distinctOrderIds.size + singletonCount;

  const productCost = source.reduce((sum, r) => {
    if (!r.is_revenue_recognized) return sum;
    const costPrice = derivedByPurchaseId.get(r.purchase_id)?.cost_price;
    return sum + (costPrice ?? 0);
  }, 0);

  const operatingExpenses = await getOperatingExpensesTotal(
    { dateFrom: filters.dateFrom, dateTo: filters.dateTo, month: filters.month },
    client
  );

  const permitted = await canViewCostAndProfit(staff, client);

  // Finance Project #1, Phase D — same recognized-revenue gate as
  // productCost above (never deduct commission for a sale whose revenue
  // wasn't counted), scoped to exactly these Orders/purchases so Partner
  // Compensation/Staff Commission can never be pulled in from an
  // unrelated date-range match. Skipped entirely (no DB round trip) for a
  // viewer who can't see cost-derived figures anyway.
  let partnerCompensation: number | null = null;
  let staffCommission: number | null = null;
  if (permitted) {
    const recognizedPurchaseIds: string[] = [];
    const recognizedOrderIds = new Set<string>();
    for (const r of source) {
      if (!r.is_revenue_recognized) continue;
      recognizedPurchaseIds.push(r.purchase_id);
      const orderId = derivedByPurchaseId.get(r.purchase_id)?.order_id ?? null;
      if (orderId) recognizedOrderIds.add(orderId);
    }
    const commissionExpense = await getAccrualCommissionExpense(
      { orderIds: [...recognizedOrderIds], purchaseIds: recognizedPurchaseIds },
      client
    );
    partnerCompensation = commissionExpense.partnerCompensation;
    staffCommission = commissionExpense.staffCommission;
  }

  const cogs = permitted ? productCost : null;
  const profitLoss = permitted
    ? totalRevenue - productCost - (partnerCompensation as number) - (staffCommission as number) - operatingExpenses
    : null;
  const profitMargin = permitted ? (totalRevenue > 0 ? ((profitLoss as number) / totalRevenue) * 100 : 0) : null;

  return {
    totalRevenue,
    totalCustomers,
    totalOrders,
    operatingExpenses,
    cogs,
    partnerCompensation,
    staffCommission,
    profitLoss,
    profitMargin,
  };
}

/** Export - every currently-filtered row, not just the visible page. Walks
 * every page rather than adding a second "fetch everything" query shape,
 * same technique as Sales Ledger's getAllFilteredRowsForExport. */
export async function getAllFilteredRowsForExport(
  filters: MonthlySoldProductsFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<MonthlySoldProductRow[]> {
  const rows: MonthlySoldProductRow[] = [];
  let page = 1;
  for (;;) {
    const { rows: chunk, totalCount } = await getMonthlySoldProductsPage({ ...filters, page }, client, staff);
    rows.push(...chunk);
    if (rows.length >= totalCount || chunk.length === 0) break;
    page += 1;
  }
  return rows;
}
