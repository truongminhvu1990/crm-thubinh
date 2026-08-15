import { MonthlySoldProductRow } from "@/types/monthlySoldProducts";
import { formatDate } from "@/lib/utils";

export type MonthlySoldProductsColumnKey =
  | "sale_date"
  | "order_number"
  | "product_code"
  | "product_name"
  | "product_category"
  | "jade_type"
  | "customer"
  | "salesperson"
  | "original_price"
  | "discount"
  | "final_sale_price"
  | "gross_profit"
  | "amount_paid"
  | "remaining_balance"
  | "payment_methods";

export interface MonthlySoldProductsColumnContext {
  /** Same Owner/Manager-only gate the Gross Profit column already used
   * before column visibility existed (useIsOwnerOrManager). The server
   * already nulls gross_profit for anyone else - this only controls
   * whether the column is offered/shown at all. */
  canViewGrossProfit: boolean;
}

export interface MonthlySoldProductsColumnDef {
  key: MonthlySoldProductsColumnKey;
  label: string;
  width: number;
  availableWhen?: (ctx: MonthlySoldProductsColumnContext) => boolean;
  exportValue: (row: MonthlySoldProductRow) => string | number;
}

/** Single source of truth for Monthly Sold Products' own column set -
 * shared by its table, its own "Cột hiển thị" column picker, and its Excel
 * export. Entirely separate from Sales Ledger's own SALES_LEDGER_COLUMNS
 * (lib/salesLedger/salesLedgerColumns.ts) - same report *shape* (a
 * detailed per-sale table with column visibility + export), different
 * report, different field set, deliberately not merged (Task 5). Matches
 * docs/07_REPORTING_SPEC.md's locked field list exactly: Sale Date,
 * Product Code, Product Name, Category, Jade Type, Customer, Salesperson,
 * Sale Price, Discount, Final Price, Profit, Order Number - order here is
 * the display/export order (existing order preserved; Jade Type inserted
 * next to the other product-descriptive fields it was missing from). */
export const MONTHLY_SOLD_PRODUCTS_COLUMNS: MonthlySoldProductsColumnDef[] = [
  // Table already displays this formatted (formatDate) - export now
  // matches it, unifying a pre-existing table/export inconsistency (the
  // old hardcoded export list used the raw ISO string).
  { key: "sale_date", label: "Ngày bán", width: 14, exportValue: (r) => formatDate(r.sale_date) },
  { key: "order_number", label: "Số đơn", width: 16, exportValue: (r) => r.order_number || "" },
  { key: "product_code", label: "Mã sản phẩm", width: 16, exportValue: (r) => r.product_code || "" },
  { key: "product_name", label: "Tên sản phẩm", width: 28, exportValue: (r) => r.product_name || "" },
  { key: "product_category", label: "Danh mục", width: 16, exportValue: (r) => r.product_category || "" },
  { key: "jade_type", label: "Loại ngọc", width: 16, exportValue: (r) => r.jade_type || "" },
  { key: "customer", label: "Khách hàng", width: 24, exportValue: (r) => r.customer_name },
  { key: "salesperson", label: "Nhân viên", width: 18, exportValue: (r) => r.salesperson || "" },
  { key: "original_price", label: "Giá gốc", width: 16, exportValue: (r) => r.original_price ?? "" },
  { key: "discount", label: "Chiết khấu", width: 14, exportValue: (r) => r.discount ?? "" },
  { key: "final_sale_price", label: "Giá bán cuối", width: 16, exportValue: (r) => r.final_sale_price },
  {
    key: "gross_profit",
    label: "Lãi gộp",
    width: 16,
    availableWhen: (ctx) => ctx.canViewGrossProfit,
    exportValue: (r) => r.gross_profit ?? "",
  },
  // Payment Details (Product Owner task, 2026-08-14) - Order-level fields,
  // see types/monthlySoldProducts.ts's MonthlySoldProductRow doc comment.
  // No availableWhen gate: unlike Gross Profit these aren't cost/margin
  // figures, and reports.view already gates the whole report.
  { key: "amount_paid", label: "Đã thanh toán", width: 16, exportValue: (r) => r.amount_paid ?? "" },
  { key: "remaining_balance", label: "Tiền còn lại", width: 16, exportValue: (r) => r.remaining_balance ?? "" },
  { key: "payment_methods", label: "Phương thức thanh toán", width: 22, exportValue: (r) => r.payment_methods || "" },
];

/** Columns the current viewer may see at all - the picker only offers
 * these, and export only ever includes a subset of these. */
export function getAvailableMonthlySoldProductsColumns(ctx: MonthlySoldProductsColumnContext): MonthlySoldProductsColumnDef[] {
  return MONTHLY_SOLD_PRODUCTS_COLUMNS.filter((c) => !c.availableWhen || c.availableWhen(ctx));
}

/** Default visible set = every column, matching this table's behavior
 * before column visibility existed (every available column was always
 * shown) - including the newly-added Jade Type, since it's a locked report
 * field being brought into compliance, not an optional extra. */
export const DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS: Set<MonthlySoldProductsColumnKey> = new Set(
  MONTHLY_SOLD_PRODUCTS_COLUMNS.map((c) => c.key)
);
