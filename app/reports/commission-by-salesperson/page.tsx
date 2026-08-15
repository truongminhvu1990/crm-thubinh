"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { rangeSearchParams } from "@/lib/reports/reportsApiClient";
import { currency } from "@/lib/reports/format";
import { CommissionBySalespersonRow } from "@/types/commissionReporting";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ScopeIndicator from "@/components/shared/ScopeIndicator";

/** ST-3 — Commission by Salesperson (docs/07_REPORTING_SPEC.md §8,
 * restating docs/06_COMMISSION_SPEC.md §16). Reporting-owned Projection
 * over `sales_commissions` (lib/commissionReporting/), never Commission's
 * own service. */
export default function CommissionBySalespersonPage() {
  const { range } = useGlobalDateFilter();
  const [rows, setRows] = useState<CommissionBySalespersonRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/reports/commission-by-salesperson?${rangeSearchParams(range)}`)
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data: { rows: CommissionBySalespersonRow[] }) => {
        if (!cancelled) setRows(data.rows);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end]);

  const totalCommission = rows.reduce((sum, r) => sum + r.totalCommissionAmount, 0);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-primary" />
            Hoa hồng theo nhân viên
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm flex items-center gap-2 flex-wrap">
            Doanh số và hoa hồng đã tính cho từng nhân viên
            <ScopeIndicator resource="commissions" />
          </p>
          <div className="mt-1">
            <PageViewingLabel />
          </div>
        </div>
        <GlobalDateFilter />
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6 flex items-center gap-3">
          <Coins className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground">Tổng hoa hồng:</span>
          <span className="text-lg font-semibold text-foreground">{currency.format(totalCommission)}</span>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin text-2xl">⟳</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground text-sm" data-testid="commission-by-salesperson-empty-state">
              Không có hoa hồng nào trong khoảng thời gian đã chọn
            </p>
          </div>
        ) : (
          <table data-testid="commission-by-salesperson-table" className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Nhân viên
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Số giao dịch
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Doanh số
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Hoa hồng
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Hoa hồng TB
                </th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort((a, b) => b.totalCommissionAmount - a.totalCommissionAmount)
                .map((r) => (
                  <tr
                    key={r.salespersonId ?? r.salespersonName}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{r.salespersonName}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.dealCount}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{currency.format(r.totalSaleAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {currency.format(r.totalCommissionAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {currency.format(r.averageCommissionAmount)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
