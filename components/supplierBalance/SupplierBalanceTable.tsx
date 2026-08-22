"use client";

import { Landmark } from "lucide-react";
import { SupplierBalanceRow } from "@/types/supplierBalance";
import { formatDate } from "@/lib/utils";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatAmount(amount: number, currency: string): string {
  return currency === "VND" ? vnd.format(amount) : `¥${cny.format(amount)}`;
}

interface Props {
  rows: SupplierBalanceRow[];
  isLoading?: boolean;
}

/** Supplier Balance (Finance Project #1, Phase F re-scope, Product Owner
 * Approval 2026-08-21) — one row per (Supplier, currency), matching the
 * Product Owner's own required column order exactly: Supplier → Currency
 * → Total IN → Total OUT → Balance → Last Transaction. Deliberately no
 * status/judgment badge and no color-coded "abnormal" styling for a
 * negative balance (unlike MoneyChangerBalanceTable's own "CNY âm" badge)
 * — PO-D4 (Asset vs. Payable classification) is still unresolved, so this
 * report must not imply a negative balance is bad/owed or a positive one
 * is good/available. Numbers are shown as plain figures only. */
export default function SupplierBalanceTable({ rows, isLoading = false }: Props) {
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
          <Landmark className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm" data-testid="supplier-balance-empty-state">
          Không có Supplier nào khớp với bộ lọc đã chọn
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="lg:hidden space-y-3">
        {rows.map((r) => (
          <div
            key={`${r.partyId}::${r.currency}`}
            data-testid="supplier-balance-mobile-row"
            className="bg-card rounded-xl border border-border shadow-sm p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{r.supplierName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.supplierCode} · {r.currency}
                </p>
              </div>
              <span className="text-lg font-bold text-foreground tabular-nums shrink-0" data-testid="supplier-balance-mobile-balance">
                {formatAmount(r.balance, r.currency)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>IN {formatAmount(r.totalIn, r.currency)}</span>
              <span>OUT {formatAmount(r.totalOut, r.currency)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Giao dịch gần nhất: {r.lastTransactionDate ? formatDate(r.lastTransactionDate) : "—"} ({r.transactionCount})
            </div>
          </div>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="supplier-balance-table" className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Đơn vị tiền tệ</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tổng IN</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tổng OUT</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Số dư</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giao dịch gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.partyId}::${r.currency}`} data-testid={`supplier-balance-row-${r.partyId}-${r.currency}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-5 py-3.5">
                  <span className="font-medium text-foreground">{r.supplierName}</span>
                  <span className="block text-xs text-muted-foreground">{r.supplierCode}</span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{r.currency}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">{formatAmount(r.totalIn, r.currency)}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">{formatAmount(r.totalOut, r.currency)}</td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-foreground" data-testid="supplier-balance-amount">
                  {formatAmount(r.balance, r.currency)}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                  {r.lastTransactionDate ? `${formatDate(r.lastTransactionDate)} (${r.transactionCount})` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
