"use client";

import { Receipt } from "lucide-react";
import { MonthlySoldProductRow } from "@/types/monthlySoldProducts";
import { formatDate } from "@/lib/utils";

interface Props {
  rows: MonthlySoldProductRow[];
  isLoading?: boolean;
  /** Gross Profit ("if available" per the brief) - Owner/Manager only,
   * same gate as Sales Ledger's own Cost/Profit column
   * (useIsOwnerOrManager). The server already nulls gross_profit out for
   * anyone else, but the column itself is hidden entirely rather than shown
   * with blank cells, matching that established convention. */
  canViewGrossProfit?: boolean;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value !== null ? currency.format(value) : "—";
}

export default function MonthlySoldProductsTable({ rows, isLoading = false, canViewGrossProfit = false }: Props) {
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
            {[
              "Ngày bán",
              "Số đơn",
              "Mã sản phẩm",
              "Tên sản phẩm",
              "Danh mục",
              "Khách hàng",
              "Nhân viên",
              "Giá gốc",
              "Chiết khấu",
              "Giá bán cuối",
            ].map((h) => (
              <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {h}
              </th>
            ))}
            {canViewGrossProfit && (
              <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Lãi gộp
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.purchase_id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(r.sale_date)}</td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.order_number || "—"}</td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.product_code || "—"}</td>
              <td className="px-4 py-3.5 text-sm font-medium text-foreground">{r.product_name || "—"}</td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.product_category || "—"}</td>
              <td className="px-4 py-3.5">
                <div className="text-sm font-medium text-foreground">{r.customer_name}</div>
                <div className="text-xs text-muted-foreground">{r.customer_code}</div>
              </td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{r.salesperson || "—"}</td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{money(r.original_price)}</td>
              <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">{money(r.discount)}</td>
              <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">{money(r.final_sale_price)}</td>
              {canViewGrossProfit && (
                <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">{money(r.gross_profit)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
