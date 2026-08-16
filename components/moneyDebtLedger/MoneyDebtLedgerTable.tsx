"use client";

import { ArrowDownLeft, ArrowUpRight, BookText } from "lucide-react";
import { MoneyDebtLedgerEntry } from "@/types/moneyDebtLedger";
import { moneyDebtLedgerTypeLabel } from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";
import { formatDate } from "@/lib/utils";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatAmount(amount: number, currency: string): string {
  return currency === "VND" ? vnd.format(amount) : `¥${cny.format(amount)}`;
}

interface Props {
  entries: MoneyDebtLedgerEntry[];
  isLoading?: boolean;
}

/** Read-only, no row actions of any kind — ledger rows are immutable once
 * created (D7, docs/19_MONEY_DEBT_LEDGER_SPEC.md §23). A correction is a
 * new 'Adjustment' row, created the same way any other movement is
 * (Record Movement), never an edit on an existing row here. */
export default function MoneyDebtLedgerTable({ entries, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <BookText className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có giao dịch nào trong Money &amp; Debt Ledger</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table data-testid="money-debt-ledger-table" className="w-full min-w-[1200px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mã giao dịch</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loại</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Đối tác</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chiều</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Số tiền</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nhóm giao dịch</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Liên kết</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ngày</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-5 py-3.5 text-sm font-medium text-foreground">{e.entry_code}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{moneyDebtLedgerTypeLabel(e.transaction_type)}</td>
              <td className="px-5 py-3.5 text-sm text-foreground">{e.party?.name ?? "—"}</td>
              <td className="px-5 py-3.5 text-sm">
                {e.direction === "IN" ? (
                  <span className="inline-flex items-center gap-1 text-secondary-foreground">
                    <ArrowDownLeft className="w-3.5 h-3.5" /> IN
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <ArrowUpRight className="w-3.5 h-3.5" /> OUT
                  </span>
                )}
              </td>
              <td className="px-5 py-3.5 text-sm font-medium">{formatAmount(e.amount, e.currency)}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{e.transaction_group ?? "—"}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {e.payment ? `Payment · ${vnd.format(e.payment.amount)}` : e.order ? `Order ${e.order.order_number}` : "—"}
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{formatDate(e.transaction_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
