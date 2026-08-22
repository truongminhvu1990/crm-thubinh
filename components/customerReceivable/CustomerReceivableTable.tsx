"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { CustomerReceivableRow } from "@/types/customerReceivable";
import Badge from "@/components/ui/Badge";
import {
  CustomerReceivableColumnKey,
  CUSTOMER_RECEIVABLE_COLUMNS,
  DEFAULT_VISIBLE_CUSTOMER_RECEIVABLE_COLUMNS,
} from "@/lib/customerReceivable/customerReceivableColumns";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Outstanding: "warning",
  Settled: "success",
  Overpaid: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  Outstanding: "Còn nợ",
  Settled: "Đã thanh toán đủ",
  Overpaid: "Dư",
};

interface Props {
  rows: CustomerReceivableRow[];
  isLoading?: boolean;
  visibleColumns?: Set<CustomerReceivableColumnKey>;
  columnOrder?: CustomerReceivableColumnKey[];
}

/** Same "Compact Row + Detail" mobile pattern every other report/list table
 * in this codebase already uses (SettlementTable/CompensationTable) — a
 * card per Order on narrow viewports instead of the dense multi-column
 * table, every card linking to the same /orders/[id] Detail route the
 * desktop table's Order column already uses. */
export default function CustomerReceivableTable({
  rows,
  isLoading = false,
  visibleColumns = DEFAULT_VISIBLE_CUSTOMER_RECEIVABLE_COLUMNS,
  columnOrder = CUSTOMER_RECEIVABLE_COLUMNS.map((c) => c.key),
}: Props) {
  const byKey = new Map(CUSTOMER_RECEIVABLE_COLUMNS.map((c) => [c.key, c]));
  const orderedVisibleColumns = columnOrder.map((key) => byKey.get(key)).filter((c): c is NonNullable<typeof c> => !!c && visibleColumns.has(c.key));

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
        <p className="text-muted-foreground text-sm" data-testid="customer-receivable-empty-state">
          Không có đơn hàng nào khớp với bộ lọc đã chọn
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="lg:hidden space-y-3">
        {rows.map((r) => (
          <Link
            key={r.orderId}
            href={`/orders/${r.orderId}`}
            data-testid="customer-receivable-mobile-row"
            className="block bg-card rounded-xl border border-border shadow-sm p-4 active:bg-muted/30 transition-colors touch-manipulation"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{r.customerName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.customerCode} · {r.orderNumber}
                </p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[r.settlementState] ?? "muted"}>{STATUS_LABEL[r.settlementState] ?? r.settlementState}</Badge>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm mt-2.5">
              <span className="text-muted-foreground">Tổng {currency.format(r.totalAmount)}</span>
              <span className={`font-semibold ${r.settlementState === "Overpaid" ? "text-amber-600" : "text-foreground"}`}>
                {r.settlementState === "Outstanding" && currency.format(r.remainingBalance)}
                {r.settlementState === "Settled" && "Đã đủ"}
                {r.settlementState === "Overpaid" && `Dư ${currency.format(r.overpaidAmount)}`}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="customer-receivable-table" className="w-full min-w-[1200px]">
          <thead>
            <tr className="border-b border-border">
              {orderedVisibleColumns.map((c) => (
                <th
                  key={c.key}
                  className={`px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                    c.headerAlign === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.orderId} className="border-b border-border last:border-0 hover:bg-muted/30">
                {orderedVisibleColumns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5 text-sm">
                    {col.renderCell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
