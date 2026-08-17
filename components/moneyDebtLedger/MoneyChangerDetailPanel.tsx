"use client";

import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import { MoneyDebtLedgerBalance } from "@/types/moneyDebtLedger";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

interface BalanceRow extends MoneyDebtLedgerBalance {
  party: { id: string; name: string; partner_type: string } | null;
}

interface Props {
  partyId: string;
  balances: BalanceRow[];
  onClear: () => void;
}

/** Stage 20 Phase C — drill-down for one selected Money Changer, shown
 * inline (no separate page/route — an inline panel is enough per the
 * task's own "không cần chuyển sang một page riêng nếu drawer/detail
 * panel đủ tốt"). Selecting a Money Changer also filters the transaction
 * table below (wired from the parent page) — this panel is the summary
 * half of that same filtered view. */
export default function MoneyChangerDetailPanel({ partyId, balances, onClear }: Props) {
  const vndRow = balances.find((b) => b.party_id === partyId && b.currency === "VND");
  const cnyRow = balances.find((b) => b.party_id === partyId && b.currency === "CNY");
  const name = vndRow?.party?.name ?? cnyRow?.party?.name ?? "—";

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6" data-testid="money-changer-detail-panel">
      <div className="flex items-start justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground uppercase tracking-wide">{name}</h2>
        <Button data-testid="money-changer-detail-clear-button" variant="secondary" size="sm" onClick={onClear}>
          <X className="w-3.5 h-3.5" />
          Bỏ lọc
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Số dư VND</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{vnd.format(vndRow?.balance ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground uppercase tracking-wide">Tổng nhận (IN)</p>
          <p className="text-sm font-medium text-secondary mt-0.5">{vnd.format(vndRow?.total_in ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Tổng sử dụng (OUT)</p>
          <p className="text-sm font-medium text-destructive mt-0.5">{vnd.format(vndRow?.total_out ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Số dư CNY</p>
          <p className={`text-sm font-medium mt-0.5 ${(cnyRow?.balance ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
            {cnyRow ? `¥${cny.format(cnyRow.balance)}` : "0"}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Bảng giao dịch bên dưới đang được lọc theo {name}.</p>
    </div>
  );
}
