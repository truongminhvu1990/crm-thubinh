"use client";

import { Fragment, ReactNode } from "react";
import { Receipt } from "lucide-react";
import { MonthlySoldProductRow } from "@/types/monthlySoldProducts";
import { formatDate } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/reports/labels.vi";
import EntityLink from "@/components/reports/entity/EntityLink";
import Badge from "@/components/ui/Badge";
import { recognitionLabel } from "@/lib/monthlySoldProducts/monthlySoldProductsColumns";
import {
  MONTHLY_SOLD_PRODUCTS_COLUMNS,
  MonthlySoldProductsColumnKey,
  DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS,
  getAvailableMonthlySoldProductsColumns,
} from "@/lib/monthlySoldProducts/monthlySoldProductsColumns";

interface Props {
  rows: MonthlySoldProductRow[];
  isLoading?: boolean;
  /** Gross Profit ("if available" per the brief) - Owner/Manager only,
   * same gate as Sales Ledger's own Cost/Profit column
   * (useIsOwnerOrManager). The server already nulls gross_profit out for
   * anyone else, but the column itself is hidden entirely rather than shown
   * with blank cells, matching that established convention. */
  canViewGrossProfit?: boolean;
  /** Column Customization (2026-08-12) - which MONTHLY_SOLD_PRODUCTS_COLUMNS
   * keys the user currently has checked in "Cột hiển thị". Defaults to
   * every column (all visible), matching this table's behavior before
   * column visibility existed. Only used when `columnKeys` is not given. */
  visibleColumns?: Set<MonthlySoldProductsColumnKey>;
  /** Phase 1.6 Wave B1.2: the columns to render, ALREADY normalised, visibility-filtered and ordered by the shared column preference
   * (useReportColumns). Header and cells are both produced from this one list, so their order can never differ. When given it replaces
   * `visibleColumns`. Presentation only: it is never part of the data request. */
  columnKeys?: string[];
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value !== null ? currency.format(value) : "—";
}

const TH = "px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const TD_MUTED = "px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap";

/** The 15 registry columns plus "recognition". One entry per column: its header and its cell, side by side, so reordering moves both. */
const COLUMNS: Record<string, { label: string; td: (r: MonthlySoldProductRow) => ReactNode }> = {
  sale_date: { label: "Ngày bán", td: (r) => <td className={TD_MUTED}>{formatDate(r.sale_date)}</td> },
  order_number: {
    label: "Số đơn",
    td: (r) => (
      <td className={TD_MUTED}>
        <EntityLink type="order" id={r.order_id}>{r.order_number || "—"}</EntityLink>
      </td>
    ),
  },
  product_code: {
    label: "Mã sản phẩm",
    td: (r) => (
      <td className={TD_MUTED}>
        <EntityLink type="product" id={r.product_id}>{r.product_code || "—"}</EntityLink>
      </td>
    ),
  },
  product_name: {
    label: "Tên sản phẩm",
    td: (r) => (
      <td className="px-4 py-3.5 text-sm font-medium text-foreground">
        <EntityLink type="product" id={r.product_id}>{r.product_name || "—"}</EntityLink>
      </td>
    ),
  },
  product_category: { label: "Danh mục", td: (r) => <td className={TD_MUTED}>{r.product_category || "—"}</td> },
  jade_type: { label: "Loại ngọc", td: (r) => <td className={TD_MUTED}>{r.jade_type || "—"}</td> },
  customer: {
    label: "Khách hàng",
    td: (r) => (
      <td className="px-4 py-3.5">
        <div className="text-sm font-medium text-foreground"><EntityLink type="customer" id={r.customer_id}>{r.customer_name}</EntityLink></div>
        <div className="text-xs text-muted-foreground">{r.customer_code}</div>
      </td>
    ),
  },
  salesperson: { label: "Nhân viên", td: (r) => <td className={TD_MUTED}>{r.salesperson || "—"}</td> },
  original_price: { label: "Giá gốc", td: (r) => <td className={TD_MUTED}>{money(r.original_price)}</td> },
  discount: { label: "Chiết khấu", td: (r) => <td className={TD_MUTED}>{money(r.discount)}</td> },
  final_sale_price: { label: "Giá bán cuối", td: (r) => <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">{money(r.final_sale_price)}</td> },
  gross_profit: { label: "Lãi gộp", td: (r) => <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">{money(r.gross_profit)}</td> },
  amount_paid: { label: "Đã thanh toán (cả đơn)", td: (r) => <td className={TD_MUTED}>{money(r.amount_paid)}</td> },
  remaining_balance: { label: "Tiền còn lại (cả đơn)", td: (r) => <td className={TD_MUTED}>{money(r.remaining_balance)}</td> },
  payment_methods: { label: "Phương thức thanh toán", td: (r) => <td className={TD_MUTED}>{paymentMethodLabel(r.payment_methods)}</td> },
  // Whether a sold line is recognized revenue must never be hideable: mandatory in the column registry, only its position can change.
  recognition: {
    label: "Ghi nhận doanh thu",
    td: (r) => (
      <td className="px-4 py-3.5 text-sm whitespace-nowrap" data-testid="monthly-sold-products-recognition-cell">
        <Badge variant={r.recognition === "recognized" ? "success" : "warning"}>{recognitionLabel(r)}</Badge>
      </td>
    ),
  },
};

export default function MonthlySoldProductsTable({
  rows,
  isLoading = false,
  canViewGrossProfit = false,
  visibleColumns = DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS,
  columnKeys,
}: Props) {
  const availableKeys = new Set<string>(getAvailableMonthlySoldProductsColumns({ canViewGrossProfit }).map((c) => c.key));
  // Without `columnKeys` (legacy callers): registry order, filtered by the old visibility set, "recognition" always last and always shown.
  const requested = columnKeys ?? [...MONTHLY_SOLD_PRODUCTS_COLUMNS.map((c) => c.key as string), "recognition"].filter((k) => k === "recognition" || visibleColumns.has(k as MonthlySoldProductsColumnKey));
  // Never render a column the viewer may not see (gross_profit) or one this table does not know.
  const keys = requested.filter((k) => COLUMNS[k] && (k === "recognition" || availableKeys.has(k)));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Receipt className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Không có sản phẩm nào được bán trong khoảng thời gian này</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table data-testid="monthly-sold-products-table" className="w-full min-w-[1400px]">
        <thead>
          <tr className="border-b border-border">
            {keys.map((k) => (
              <th key={k} data-column-key={k} className={TH}>
                {COLUMNS[k].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line_key} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              {keys.map((k) => (
                <Fragment key={k}>{COLUMNS[k].td(r)}</Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
