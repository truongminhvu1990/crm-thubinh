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
  /** Unique row key: the order_item id for an Order line, or the
   * customer_purchases id for a legacy entry (see `is_legacy`). */
  line_key: string;
  /** customer_purchases.id when this line has a purchase snapshot (Completed
   * orders, and legacy entries); null for a sold line with no purchase yet
   * (e.g. a Reserved order with a deposit - purchases are only written at
   * completion). */
  purchase_id: string | null;
  /** Revenue & Sales Reporting Unification (Product Owner decision): the
   * Order this line belongs to, its statuses, and whether it is recognized
   * revenue (BR-001: Completed + Paid) or sold-but-unrecognized (e.g. a
   * Completed order not fully paid, or a Reserved order with a deposit).
   * Legacy entries (`is_legacy`, no linked Order) have no Order and are
   * recognized by BR-002 (LOCKED). */
  order_id: string | null;
  order_status: string | null;
  payment_status: string | null;
  recognition: "recognized" | "unrecognized";
  is_legacy: boolean;
  /** Order date for an Order line (the report's date basis - same as the
   * Dashboard's); customer_purchases.sale_date for a legacy entry. Shown
   * as "Ngày bán". */
  sale_date: string;
  order_number: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  product_category: string | null;
  /** Column Customization (2026-08-12) - brings this report into compliance
   * with docs/07_REPORTING_SPEC.md's locked field list, which names Jade
   * Type as one of the report's fields. `products.jade_type` is a real,
   * already-LOCKED Business Attribute (docs/02_PRODUCT_SPEC.md §8) - not a
   * new business rule - resolved the same way cost_price already is, via
   * the existing products enrichment join (see
   * getDerivedFieldsByPurchaseId in monthlySoldProducts.repository.ts).
   * Null when the product has no jade_type set. */
  jade_type: string | null;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  salesperson: string | null;
  original_price: number | null;
  discount: number | null;
  final_sale_price: number;
  gross_profit: number | null;
  /** Payment Details (Product Owner task, 2026-08-14) - Order-level, not
   * per-product-line: `payments` records amounts against the Order as a
   * whole, not against individual order_items, and the Product Owner's own
   * definition is explicit ("actual payment amount recorded against the
   * Order" / "Order total ... minus actual payments recorded against that
   * Order") - so every product row belonging to the same Order shows that
   * Order's own totals, not an invented per-line allocation. `null` for
   * purchases with no linked Order (manual/historical entries have no Order
   * to record payments against), same treatment as original_price/discount
   * above. See lib/reports/orderPaymentSummary.ts for the derivation
   * (reuses lib/orders/order.rules.ts's calculateAmountPaid/
   * calculateRemainingBalance verbatim). */
  amount_paid: number | null;
  remaining_balance: number | null;
  /** Distinct payment_method values recorded on the Order, comma-joined -
   * never collapsed to a single assumed method (see
   * lib/reports/orderPaymentSummary.ts doc comment). `null` when the Order
   * has no payments yet, or there is no linked Order. */
  payment_methods: string | null;
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
// (Revenue / COGS / Partner Compensation / Staff Commission / Operating
// Expenses / Net Profit-Loss / Profit Margin). Same Owner/Manager-only gate
// as profitLoss/profitMargin ("Keep existing permissions" - cogs is
// cost-derived exactly like those two, so it reuses their existing gate
// rather than introducing a new one).
//
// partnerCompensation / staffCommission (Finance Project #1, Phase D,
// Product Owner Approval 2026-08-21) - accrual-basis commission expense,
// now subtracted in profitLoss alongside cogs/operatingExpenses (see
// lib/monthlySoldProducts/monthlySoldProducts.service.ts's own doc comment
// and lib/reports/commissionExpense.ts for the full accrual-vs-cash
// reasoning). Same Owner/Manager-only gate as cogs - both are cost-derived.
// Partner Compensation and Staff Commission stay two separate systems
// (compensations / sales_commissions) - exposed as two distinct fields
// here, never merged into one number before this point, so the Financial
// Summary panel can show them as separate line items.
export interface MonthlySoldProductsSummary {
  /** Revenue & Sales Reporting Unification. SOLD VALUE = RECOGNIZED +
   * UNRECOGNIZED, exactly. Sold scope and the recognition split are defined
   * once in lib/reports/revenueDefinition.ts (isSoldOrder / isOrderRecognized). */
  soldValue: number;
  /** BR-001 recognized revenue of the sold lines (Completed + Paid, plus
   * BR-002 legacy entries). Formerly `totalRevenue`. */
  recognizedRevenue: number;
  /** The part of `recognizedRevenue` that is BR-002 (LOCKED) legacy entries
   * with no linked Order - already INCLUDED in recognizedRevenue, exposed
   * only so the recognized total can be reconciled to the Dashboard's
   * "Doanh thu đã ghi nhận" (which includes the same BR-002 revenue). */
  legacyRecognizedValue: number;
  unrecognizedValue: number;
  /** Number of sold product lines (rows). */
  soldLines: number;
  totalCustomers: number;
  /** Distinct sold Orders (+ each legacy entry as its own single-item
   * "order", unchanged from before) = recognizedOrders + unrecognizedOrders. */
  totalOrders: number;
  recognizedOrders: number;
  unrecognizedOrders: number;
  /** recognizedRevenue / soldValue in [0, 1]; 0 when soldValue is 0. */
  recognizedRatio: number;
  operatingExpenses: number;
  cogs: number | null;
  partnerCompensation: number | null;
  staffCommission: number | null;
  profitLoss: number | null;
  profitMargin: number | null;
}
