"use client";

import { MoneyDebtLedgerBalance } from "@/types/moneyDebtLedger";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

interface BalanceRow extends MoneyDebtLedgerBalance {
  party: { id: string; name: string; partner_type: string } | null;
}

interface Props {
  balances: BalanceRow[];
}

/** §19 — VND and CNY balances are always shown separately per party, never
 * summed or converted into one figure (D5). No balance is labeled Asset or
 * Payable/Debt here.
 *
 * Stage 20 (UI/Reporting refactor) — Money Changer balances (both VND and
 * CNY) now live in the primary MoneyChangerBalanceTable above this
 * component (Phase B — one compact table, not a card grid). This
 * component's remaining job is the secondary "other balances" section:
 * every non-Money-Changer party+currency balance (currently: Supplier CNY/
 * VND holdings from the Deposit/Deposit Consumed/Supplier Payment/CNY Held
 * By Supplier flows) — lower visual priority, per Phase P. */
export default function BalanceSummaryCards({ balances }: Props) {
  const rest = balances.filter((b) => b.party?.partner_type !== "Money Changer");
  if (rest.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Số dư khác (Nhà cung cấp)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rest.map((b) => (
          <div key={`${b.party_id}-${b.currency}`} className="bg-card border border-border rounded-xl p-4 shadow-sm" data-testid="money-debt-ledger-balance-card">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">{b.party?.name ?? "Không xác định"}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{b.party?.partner_type ?? "—"}</span>
            </div>
            <div className={`text-2xl font-bold ${b.balance < 0 ? "text-destructive" : "text-foreground"}`}>
              {b.currency === "VND" ? vnd.format(b.balance) : `¥${cny.format(b.balance)}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {b.currency} · IN {b.currency === "VND" ? vnd.format(b.total_in) : `¥${cny.format(b.total_in)}`} · OUT{" "}
              {b.currency === "VND" ? vnd.format(b.total_out) : `¥${cny.format(b.total_out)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
