// Monthly Sold Products Report - replaces "Top Selling Products" (Product
// Owner Decision, 2026-07-27): each product is a unique SKU normally sold
// only once, so a Top-Selling-Products ranking has little business value.
// This report lists every individual product sale in the selected period
// instead of ranking products by aggregate revenue.
//
// One row = one customer_purchases record (already one row per product
// unit sold, per this codebase's existing data model) enriched with:
//  - order_number: resolved via customer_purchases.order_item_id ->
//    order_items.order_id -> orders.order_number. null for purchases with
//    no linked Order (manual/historical entries, or pre-Orders sales) -
//    same "no fabricated linkage" rule already applied to Sales Ledger's
//    own Order Number column.
//  - original_price/discount: for Order-linked rows, the order_item's own
//    snapshot_sale_price/discount (the actual values recorded at sale
//    time). For rows with no linked Order, customer_purchases never stored
//    a separate original price/discount (only the final sale_price) - null
//    ("-" in the UI), never the product's current catalog price (Product
//    Owner Review, 2026-07-27: this report shows historical sales data
//    only, and the current catalog price may not match what was actually
//    charged on that historical sale_date).
//  - final_sale_price: customer_purchases.sale_price, verbatim - always
//    accurate regardless of Order linkage.
//  - gross_profit: final_sale_price - products.cost_price, only when
//    cost_price is known AND the viewer is Owner/Manager (same
//    Owner/Manager-only gate already used for Cost/Profit on the Sales
//    Ledger table) - null otherwise ("if available" per the brief).
export interface MonthlySoldProductRow {
  purchase_id: string;
  sale_date: string;
  order_number: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  product_category: string | null;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  salesperson: string | null;
  original_price: number | null;
  discount: number | null;
  final_sale_price: number;
  gross_profit: number | null;
}

export interface MonthlySoldProductsFilters {
  dateFrom?: string;
  dateTo?: string;
  /** Quick "this calendar month" shortcut - when set, overrides
   * dateFrom/dateTo with that month's [start, end) bounds. Format YYYY-MM. */
  month?: string;
  salespersonId?: string;
  productCategory?: string;
  customer?: string;
  page: number;
}

export const MONTHLY_SOLD_PRODUCTS_PAGE_SIZE = 50;

export interface MonthlySoldProductsPage {
  rows: MonthlySoldProductRow[];
  totalCount: number;
}

// Summary Cards (Product Owner Decision, 2026-07-28): Average Selling
// Price/Average Order Value removed; the card set is now exactly these 4,
// in this display order. Profit/Loss = Total Revenue - Product Cost -
// Operating Expenses. profitLoss/profitMargin are `null` for a viewer who
// can't see Cost/Profit - same Owner/Manager-only gate this report's Gross
// Profit column already uses (both are cost-derived), reused rather than a
// new rule invented for this card. operatingExpenses is NOT gated - Staff
// already has View access to the Expense Management list itself (Product
// Owner Decision, Expense Management, 2026-07-28 - Permissions), so hiding
// its sum here would be inconsistent with that.
//
// cogs (Financial Summary enhancement, Product Owner Decision, 2026-07-28):
// "Cost of Goods Sold" - the same Product Cost figure that was already being
// computed internally for the Profit/Loss formula above, now also exposed
// as its own line item for the Financial Summary panel's itemized layout
// (Revenue / COGS / Operating Expenses / Net Profit-Loss / Profit Margin).
// Same Owner/Manager-only gate as profitLoss/profitMargin ("Keep existing
// permissions" - cogs is cost-derived exactly like those two, so it reuses
// their existing gate rather than introducing a new one).
export interface MonthlySoldProductsSummary {
  totalRevenue: number;
  totalCustomers: number;
  totalOrders: number;
  operatingExpenses: number;
  cogs: number | null;
  profitLoss: number | null;
  profitMargin: number | null;
}
