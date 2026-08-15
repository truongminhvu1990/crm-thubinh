import { SalesLedgerRow } from "@/types/salesLedger";
import { COMMISSION_STATUS_LABEL } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";

export type SalesLedgerColumnKey =
  | "sale_date"
  | "order_number"
  | "product_code"
  | "product_name"
  | "customer"
  | "salesperson"
  | "sale_amount"
  | "commission_amount"
  | "cost_price"
  | "profit"
  | "commission_status"
  | "entry_source"
  | "audit_info"
  | "duplicate";

export interface SalesLedgerColumnContext {
  canViewCostAndProfit: boolean;
  verificationMode: boolean;
  costByProductId: Map<string, number>;
}

export interface SalesLedgerColumnDef {
  key: SalesLedgerColumnKey;
  label: string;
  /** Excel column width - carried over from the pre-existing hard-coded
   * export column list. */
  width: number;
  /** When present, this column only exists - in the picker, the table, and
   * export - while the predicate holds. Restates the Owner/Manager
   * Cost/Profit gate and the Verification Mode gate the table already
   * enforced before column visibility existed (Task 3); never a new
   * permission or a new business rule. */
  availableWhen?: (ctx: SalesLedgerColumnContext) => boolean;
  exportValue: (row: SalesLedgerRow, ctx: SalesLedgerColumnContext) => string | number;
}

/** Single source of truth for Sales Ledger's column set - shared by the
 * table (presentation), the "Cột hiển thị" column picker (what a user may
 * toggle), and Excel export (Locked Decision 2A: export follows the user's
 * current column visibility, same order, same labels). Order here is the
 * display/export order; hiding a column never reorders the rest. */
export const SALES_LEDGER_COLUMNS: SalesLedgerColumnDef[] = [
  { key: "sale_date", label: "Ngày bán", width: 14, exportValue: (r) => formatDate(r.sale_date) },
  // Order Number - customer_purchases has no linkage exposed on the
  // sales_ledger view, so this column is always empty rather than
  // fabricated (unchanged from before column visibility existed).
  { key: "order_number", label: "Số đơn", width: 16, exportValue: () => "" },
  { key: "product_code", label: "Mã sản phẩm", width: 16, exportValue: (r) => r.product_code || "" },
  { key: "product_name", label: "Tên sản phẩm", width: 28, exportValue: (r) => r.product_name || "" },
  { key: "customer", label: "Khách hàng", width: 24, exportValue: (r) => r.customer_name },
  { key: "salesperson", label: "Nhân viên", width: 18, exportValue: (r) => r.salesperson || "" },
  { key: "sale_amount", label: "Giá trị bán", width: 16, exportValue: (r) => Number(r.sale_amount) || 0 },
  {
    key: "commission_amount",
    label: "Hoa hồng",
    width: 16,
    exportValue: (r) => (r.commission_amount !== null ? Number(r.commission_amount) : ""),
  },
  {
    key: "cost_price",
    label: "Giá vốn",
    width: 16,
    availableWhen: (ctx) => ctx.canViewCostAndProfit,
    exportValue: (r, ctx) => (r.product_id && ctx.costByProductId.has(r.product_id) ? ctx.costByProductId.get(r.product_id)! : ""),
  },
  {
    key: "profit",
    label: "Lãi / Lỗ",
    width: 16,
    availableWhen: (ctx) => ctx.canViewCostAndProfit,
    exportValue: (r, ctx) =>
      r.product_id && ctx.costByProductId.has(r.product_id)
        ? (Number(r.sale_amount) || 0) - ctx.costByProductId.get(r.product_id)!
        : "",
  },
  {
    key: "commission_status",
    label: "Trạng thái hoa hồng",
    width: 18,
    exportValue: (r) => (r.commission_status ? COMMISSION_STATUS_LABEL[r.commission_status] : ""),
  },
  {
    key: "entry_source",
    label: "Nguồn nhập",
    width: 16,
    availableWhen: (ctx) => ctx.verificationMode,
    exportValue: (r) => (r.entry_source ? (r.entry_source === "Historical Import" ? "Historical Import" : "Live Sale") : ""),
  },
  {
    key: "audit_info",
    label: "Thông tin ghi nhận",
    width: 30,
    availableWhen: (ctx) => ctx.verificationMode,
    exportValue: (r) =>
      `Tạo: ${r.created_by || "—"} · ${formatDate(r.purchase_created_at)} | Sửa: ${r.updated_by || "—"} · ${
        r.updated_at ? formatDate(r.updated_at) : "—"
      }`,
  },
  {
    key: "duplicate",
    label: "Trùng lặp",
    width: 16,
    availableWhen: (ctx) => ctx.verificationMode,
    exportValue: (r) => (r.is_duplicate ? "Possible Duplicate" : ""),
  },
];

/** Columns the current viewer/mode may see at all - the picker only offers
 * these, and export only ever includes a subset of these (never a column
 * the viewer isn't otherwise permitted to see on screen). */
export function getAvailableSalesLedgerColumns(ctx: SalesLedgerColumnContext): SalesLedgerColumnDef[] {
  return SALES_LEDGER_COLUMNS.filter((c) => !c.availableWhen || c.availableWhen(ctx));
}

/** Default visible set = every column, matching the table's behavior
 * before column visibility existed (every available column was always
 * shown, unconditionally). */
export const DEFAULT_VISIBLE_SALES_LEDGER_COLUMNS: Set<SalesLedgerColumnKey> = new Set(
  SALES_LEDGER_COLUMNS.map((c) => c.key)
);
