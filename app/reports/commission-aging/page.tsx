"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { currency } from "@/lib/reports/format";
import { CommissionAgingRow } from "@/types/commissionReporting";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ScopeIndicator from "@/components/shared/ScopeIndicator";

/** ST-4 — Commission Aging (docs/06_COMMISSION_SPEC.md §16). Current-state
 * (every currently-Pending commission, regardless of when created) - no
 * Global Date Filter, same "point-in-time" shape as I-1's own breakdown.
 * No aging threshold is invented (see commissionReporting.repository.ts) -
 * raw days-pending, sorted oldest first. */
export default function CommissionAgingPage() {
  const [rows, setRows] = useState<CommissionAgingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports/commission-aging")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data: { rows: CommissionAgingRow[] }) => {
        if (!cancelled) setRows(data.rows);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Hourglass className="w-6 h-6 text-primary" />
          Hoa hồng chờ duyệt
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm flex items-center gap-2 flex-wrap">
          Hoa hồng đang ở trạng thái Chờ duyệt, sắp xếp theo số ngày chờ lâu nhất
          <ScopeIndicator resource="commissions" />
        </p>
        <div className="mt-1">
          <PageViewingLabel />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin text-2xl">⟳</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-sm" data-testid="commission-aging-empty-state">
              Không có hoa hồng nào đang chờ duyệt
            </p>
          </div>
        ) : (
          <table data-testid="commission-aging-table" className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Nhân viên
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Doanh số
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Hoa hồng
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Số ngày chờ
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{r.salespersonName}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{currency.format(r.saleAmount)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{currency.format(r.commissionAmount)}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{r.daysPending} ngày</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
