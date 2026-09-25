import { SupabaseClient } from "@supabase/supabase-js";
import {
  MONTHLY_SOLD_PRODUCTS_PAGE_SIZE,
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
  const lines = await repo.getSoldLines(filters, client, staff);
  const permitted = await canViewCostAndProfit(staff);
  const from = (filters.page - 1) * MONTHLY_SOLD_PRODUCTS_PAGE_SIZE;
  const rows: MonthlySoldProductRow[] = lines.slice(from, from + MONTHLY_SOLD_PRODUCTS_PAGE_SIZE).map(toRow);
  const guardedRows = permitted ? rows : rows.map((r) => ({ ...r, gross_profit: null }));
  return { rows: guardedRows, totalCount: lines.length };
}

/** Strips the repository-only fields (cost/filter inputs) from a SoldLine. */
function toRow(line: repo.SoldLine): MonthlySoldProductRow {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cost_price, salesperson_id, sales_owner, ...row } = line;
  return row;
}

/** Summary, computed over every currently-filtered sold line (not just the
 * visible page). Revenue & Sales Reporting Unification (Product Owner
 * decision): SOLD VALUE = RECOGNIZED + UNRECOGNIZED, exactly.
 *
 *  - Sold scope, and the recognized/unrecognized split of a line, come from
 *    the repository (getSoldLines), which applies the shared definitions in
 *    lib/reports/revenueDefinition.ts - isOrderRecognized is BR-001 (LOCKED:
 *    Completed + Paid). Legacy no-Order entries stay recognized by BR-002
 *    (LOCKED), so `recognizedRevenue` keeps the same BR-001 + BR-002
 *    semantics as before and as the Dashboard's "Doanh thu đã ghi nhận".
 *    Sold scope is narrower than the Dashboard's "Tổng giá trị đơn hàng"
 *    (Completed, or Reserved with a deposit - not Draft / Reserved-unpaid),
 *    so soldValue is intentionally NOT that figure.
 *  - unrecognizedValue is soldValue - recognizedRevenue, so the identity
 *    cannot drift.
 *  - Total Orders groups lines by Order; a legacy entry with no Order is
 *    counted as its own single-item "order" (unchanged from this report's
 *    pre-existing behavior). recognizedOrders/unrecognizedOrders split that
 *    same count. Total Customers is a distinct count over the filtered set.
 *
 * Profit/Loss = recognizedRevenue - Product Cost - Partner Compensation -
 * Staff Commission - Operating Expenses (Finance Project #1, Phase D, Product
 * Owner Approval 2026-08-21). It is deliberately still computed on
 * RECOGNIZED revenue only: cost and commission are gated to recognized lines
 * (never deduct an expense for a sale whose revenue is not recognized), and
 * both commission sources stay accrual-basis and scoped to the recognized
 * order/purchase set (lib/reports/commissionExpense.ts). Operating Expenses
 * is the period's total from the Expense Management module, by date range
 * only. Profit Margin (%) = Profit/Loss / recognizedRevenue x 100. `cogs` is
 * the same productCost value, exposed as its own field.
 *
 * cogs/profitLoss/profitMargin are gated to the same Owner/Manager-only
 * visibility this report's Gross Profit column uses (canViewCostAndProfit).
 * The sold/recognized/unrecognized figures and counts stay visible to everyone
 * with reports.view. */
export async function getMonthlySoldProductsSummary(
  filters: MonthlySoldProductsFilters,
  client?: SupabaseClient,
  staff?: Staff | null
): Promise<MonthlySoldProductsSummary> {
  const lines = await repo.getSoldLines(filters, client, staff);

  let recognizedRevenue = 0;
  let legacyRecognizedValue = 0;
  let unrecognizedValue = 0;
  for (const l of lines) {
    if (l.recognition === "recognized") {
      recognizedRevenue += l.final_sale_price;
      if (l.is_legacy) legacyRecognizedValue += l.final_sale_price;
    } else unrecognizedValue += l.final_sale_price;
  }
  const soldValue = recognizedRevenue + unrecognizedValue;

  const totalCustomers = new Set(lines.map((l) => l.customer_id)).size;

  const recognizedOrderIds = new Set<string>();
  const unrecognizedOrderIds = new Set<string>();
  let legacyCount = 0;
  for (const l of lines) {
    if (l.order_id === null) legacyCount += 1;
    else if (l.recognition === "recognized") recognizedOrderIds.add(l.order_id);
    else unrecognizedOrderIds.add(l.order_id);
  }
  const recognizedOrders = recognizedOrderIds.size + legacyCount;
  const unrecognizedOrders = unrecognizedOrderIds.size;
  const totalOrders = recognizedOrders + unrecognizedOrders;

  const productCost = lines.reduce((sum, l) => (l.recognition === "recognized" ? sum + (l.cost_price ?? 0) : sum), 0);

  const operatingExpenses = await getOperatingExpensesTotal(
    { dateFrom: filters.dateFrom, dateTo: filters.dateTo, month: filters.month },
    client
  );

  const permitted = await canViewCostAndProfit(staff);

  // Same recognized-revenue gate as productCost above, scoped to exactly
  // these Orders/purchases so Partner Compensation/Staff Commission can
  // never be pulled in from an unrelated date-range match. Skipped entirely
  // (no DB round trip) for a viewer who can't see cost-derived figures.
  let partnerCompensation: number | null = null;
  let staffCommission: number | null = null;
  if (permitted) {
    const recognizedPurchaseIds: string[] = [];
    for (const l of lines) {
      if (l.recognition === "recognized" && l.purchase_id) recognizedPurchaseIds.push(l.purchase_id);
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
    ? recognizedRevenue - productCost - (partnerCompensation as number) - (staffCommission as number) - operatingExpenses
    : null;
  const profitMargin = permitted ? (recognizedRevenue > 0 ? ((profitLoss as number) / recognizedRevenue) * 100 : 0) : null;

  return {
    soldValue,
    recognizedRevenue,
    legacyRecognizedValue,
    unrecognizedValue,
    soldLines: lines.length,
    totalCustomers,
    totalOrders,
    recognizedOrders,
    unrecognizedOrders,
    recognizedRatio: soldValue > 0 ? recognizedRevenue / soldValue : 0,
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
