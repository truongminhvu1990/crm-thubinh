"use client";

import { Landmark, ChevronRight } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { MoneyDebtLedgerBalance } from "@/types/moneyDebtLedger";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

interface BalanceRow extends MoneyDebtLedgerBalance {
  party: { id: string; name: string; partner_type: string } | null;
}

interface MoneyChangerRow {
  partyId: string;
  name: string;
  vndIn: number;
  vndOut: number;
  vndBalance: number;
  cnyIn: number;
  cnyOut: number;
  cnyBalance: number;
  hasCnyActivity: boolean;
}

interface Props {
  balances: BalanceRow[];
  selectedPartyId: string | null;
  onSelect: (partyId: string | null) => void;
}

/** Stage 20 (Money & Debt Ledger UI/Reporting refactor), Phase B — the
 * primary "who has how much" view. One row per Money Changer (never one
 * big card each — that was the previous design's problem), both
 * currencies pivoted into the same row so nothing needs scrolling
 * sideways between Money Changers to compare them. Every number here is
 * read straight from balances (already Σ IN − Σ OUT per party+currency,
 * computed by the existing, unchanged getAllBalances()/getBalance()
 * business logic) — this component only groups and pivots what it's
 * given, it never computes a balance itself. A negative balance (CNY can
 * go negative under today's business rules — only Money Changer VND is
 * guarded against it) is shown in red with an explicit "Âm" badge, never
 * hidden or clamped to zero. */
export default function MoneyChangerBalanceTable({ balances, selectedPartyId, onSelect }: Props) {
  const byParty = new Map<string, MoneyChangerRow>();
  for (const b of balances) {
    if (b.party?.partner_type !== "Money Changer") continue;
    const row = byParty.get(b.party_id) ?? {
      partyId: b.party_id,
      name: b.party.name,
      vndIn: 0,
      vndOut: 0,
      vndBalance: 0,
      cnyIn: 0,
      cnyOut: 0,
      cnyBalance: 0,
      hasCnyActivity: false,
    };
    if (b.currency === "VND") {
      row.vndIn = b.total_in;
      row.vndOut = b.total_out;
      row.vndBalance = b.balance;
    } else {
      row.cnyIn = b.total_in;
      row.cnyOut = b.total_out;
      row.cnyBalance = b.balance;
      row.hasCnyActivity = true;
    }
    byParty.set(b.party_id, row);
  }
  const rows = [...byParty.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6 text-center border border-border text-sm text-muted-foreground mb-6">
        Chưa có Money Changer nào có giao dịch — chưa thể theo dõi số dư.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden mb-6" data-testid="money-changer-balance-table">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Landmark className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Số dư theo Money Changer</h2>
        <span className="text-xs text-muted-foreground">({rows.length})</span>
      </div>

      {/* Mobile compact cards — the desktop table below needs 760px+ to show
          every column un-scrolled; on a phone that hides Số dư (the single
          most important number) off-screen, so mobile gets its own layout
          that leads with balance instead (Phase O). */}
      <div className="md:hidden divide-y divide-border">
        {rows.map((r) => {
          const isSelected = selectedPartyId === r.partyId;
          const cnyNegative = r.hasCnyActivity && r.cnyBalance < 0;
          return (
            <div
              key={r.partyId}
              data-testid={`money-changer-balance-card-${r.partyId}`}
              onClick={() => onSelect(isSelected ? null : r.partyId)}
              className={`p-4 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-foreground">{r.name}</span>
                {cnyNegative ? <Badge variant="destructive">CNY âm</Badge> : <Badge variant="success">Bình thường</Badge>}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Số dư VND</span>
                <span className="text-xl font-bold text-foreground tabular-nums">{vnd.format(r.vndBalance)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                <span>
                  IN {vnd.format(r.vndIn)} · OUT {vnd.format(r.vndOut)}
                </span>
              </div>
              {r.hasCnyActivity && (
                <div className="flex items-baseline justify-between mt-1.5 pt-1.5 border-t border-border/60">
                  <span className="text-xs text-muted-foreground">Số dư CNY</span>
                  <span className={`text-sm font-semibold tabular-nums ${cnyNegative ? "text-destructive" : "text-foreground"}`}>
                    ¥{cny.format(r.cnyBalance)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">Money Changer</th>
              <th className="text-right font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">VND IN</th>
              <th className="text-right font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">VND OUT</th>
              <th className="text-right font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">Số dư VND</th>
              <th className="text-right font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">CNY IN</th>
              <th className="text-right font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">CNY OUT</th>
              <th className="text-right font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">Số dư CNY</th>
              <th className="text-left font-semibold px-4 py-2.5 text-xs text-muted-foreground uppercase tracking-wide">Trạng thái</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelected = selectedPartyId === r.partyId;
              const cnyNegative = r.hasCnyActivity && r.cnyBalance < 0;
              return (
                <tr
                  key={r.partyId}
                  data-testid={`money-changer-balance-row-${r.partyId}`}
                  onClick={() => onSelect(isSelected ? null : r.partyId)}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/40 ${isSelected ? "bg-primary/5" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                  <td className="px-4 py-3 text-right text-secondary-foreground tabular-nums">{vnd.format(r.vndIn)}</td>
                  <td className="px-4 py-3 text-right text-destructive tabular-nums">{vnd.format(r.vndOut)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{vnd.format(r.vndBalance)}</td>
                  <td className="px-4 py-3 text-right text-secondary-foreground tabular-nums">
                    {r.hasCnyActivity ? `¥${cny.format(r.cnyIn)}` : "0"}
                  </td>
                  <td className="px-4 py-3 text-right text-destructive tabular-nums">{r.hasCnyActivity ? `¥${cny.format(r.cnyOut)}` : "0"}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${cnyNegative ? "text-destructive" : "text-foreground"}`}>
                    {r.hasCnyActivity ? `¥${cny.format(r.cnyBalance)}` : "0"}
                  </td>
                  <td className="px-4 py-3">
                    {cnyNegative ? (
                      <Badge variant="destructive">CNY âm</Badge>
                    ) : (
                      <Badge variant="success">Bình thường</Badge>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
