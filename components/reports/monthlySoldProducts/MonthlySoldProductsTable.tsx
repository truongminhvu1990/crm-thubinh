"use client";

import { Receipt } from "lucide-react";
import { MonthlySoldProductRow } from "@/types/monthlySoldProducts";
import { formatDate } from "@/lib/utils";
import {
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
   * column visibility existed. */
  visibleColumns?: Set<MonthlySoldProductsColumnKey>;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value !== null ? currency.format(value) : "—";
}

export default function MonthlySoldProductsTable({
  rows,
  isLoading = false,
  canViewGrossProfit = false,
  visibleColumns = DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS,
}: Props) {
  const availableKeys = new Set(getAvailableMonthlySoldProductsColumns({ canViewGrossProfit }).map((c) => c.key));
  const show = (key: MonthlySoldProductsColumnKey) => availableKeys.has(key) && visibleColumns.has(key);

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
            {show("sale_date") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ngày bán</th>
            )}
            {show("order_number") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Số đơn</th>
            )}
            {show("product_code") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mã sản phẩm</th>
            )}
            {show("product_name") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tên sản phẩm</th>
            )}
            {show("product_category") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Danh mục</th>
            )}
            {show("jade_type") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loại ngọc</th>
            )}
            {show("customer") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Khách hàng</th>
            )}
            {show("salesperson") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nhân viên</th>
            )}
            {show("original_price") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giá gốc</th>
            )}
            {show("discount") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chiết khấu</th>
            )}
            {show("final_sale_price") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giá bán cuối</th>
            )}
            {show("gross_profit") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lãi gộp</th>
            )}
            {show("amount_paid") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Đã thanh toán</th>
            )}
            {show("remaining_balance") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tiền còn lại</th>
            )}
            {show("payment_methods") && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Phương thức thanh toán
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.purchase_id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              {show("sale_date") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(r.sale_date)}</td>
              )}
              {show("order_number") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.order_number || "—"}</td>
              )}
              {show("product_code") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.product_code || "—"}</td>
              )}
              {show("product_name") && (
                <td className="px-4 py-3.5 text-sm font-medium text-foreground">{r.product_name || "—"}</td>
              )}
              {show("product_category") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.product_category || "—"}</td>
              )}
              {show("jade_type") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.jade_type || "—"}</td>
              )}
              {show("customer") && (
                <td className="px-4 py-3.5">
                  <div className="text-sm font-medium text-foreground">{r.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_code}</div>
                </td>
              )}
              {show("salesperson") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.salesperson || "—"}</td>
              )}
              {show("original_price") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{money(r.original_price)}</td>
              )}
              {show("discount") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{money(r.discount)}</td>
              )}
              {show("final_sale_price") && (
                <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">{money(r.final_sale_price)}</td>
              )}
              {show("gross_profit") && (
                <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">{money(r.gross_profit)}</td>
              )}
              {show("amount_paid") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{money(r.amount_paid)}</td>
              )}
              {show("remaining_balance") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{money(r.remaining_balance)}</td>
              )}
              {show("payment_methods") && (
                <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.payment_methods || "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
