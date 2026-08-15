"use client";

import { useEffect, useState } from "react";
import { GitCompareArrows, CheckCircle2, AlertTriangle } from "lucide-react";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { useIsOwner } from "@/lib/hooks/useIsOwner";
import { rangeSearchParams } from "@/lib/reports/reportsApiClient";
import { currency } from "@/lib/reports/format";
import { ReportsReconciliation } from "@/types/reportsReconciliation";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";

/** E-3 — Unified Revenue Reconciliation View (docs/REPORTING_MASTER_SPEC.md
 * §10, Decision Q-2, Revision 3). Owner-only (§10 field 14) — this page
 * itself never decides which of the two figures is "correct" (§10 field
 * 17); it only exposes the discrepancy and the known mechanism behind it
 * (§10 field 16), never silently reconciling or rewriting either source. */

function Loading() {
  return (
    <div className="flex justify-center items-center h-32">
      <div className="animate-spin text-2xl">⟳</div>
    </div>
  );
}

export default function ReportsReconciliationPage() {
  const { range } = useGlobalDateFilter();
  const isOwner = useIsOwner();
  const [data, setData] = useState<ReportsReconciliation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    setIsLoading(true);
    setForbidden(false);
    fetch(`/api/reports/reconciliation?${rangeSearchParams(range)}`)
      .then((res) => {
        if (res.status === 403) {
          if (!cancelled) setForbidden(true);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((json: ReportsReconciliation | null) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, range?.start, range?.end]);

  if (!isOwner) {
    return (
      <div className="pb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Đối soát doanh thu</h1>
        <p className="text-muted-foreground mt-4">Bạn không có quyền xem báo cáo này</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <GitCompareArrows className="w-6 h-6 text-primary" />
            Đối soát doanh thu
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            So sánh Doanh thu và Khách hàng hàng đầu giữa Reports (customer_purchases) và Business Intelligence (orders)
          </p>
          <div className="mt-1">
            <PageViewingLabel />
          </div>
        </div>
        <GlobalDateFilter />
      </div>

      {isLoading || !data ? (
        forbidden ? (
          <p className="text-muted-foreground">Bạn không có quyền xem báo cáo này</p>
        ) : (
          <Loading />
        )
      ) : (
        <div className="space-y-6">
          {/* Revenue Reconciliation */}
          <section className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div
              data-testid="reconciliation-status"
              className={`flex items-center gap-2 mb-4 rounded-lg px-3 py-2 text-sm font-medium ${
                data.revenue.status === "Reconciled"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-amber-500/10 text-amber-600"
              }`}
            >
              {data.revenue.status === "Reconciled" ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {data.revenue.status === "Reconciled" ? "Đã khớp" : "Phát hiện chênh lệch"}
            </div>

            <h2 className="text-sm font-semibold text-foreground mb-3">Doanh thu</h2>
            <div className="overflow-x-auto">
              <table data-testid="reconciliation-revenue-table" className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                      Chỉ số
                    </th>
                    <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                      Reports
                    </th>
                    <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                      Business Intelligence
                    </th>
                    <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                      Chênh lệch
                    </th>
                    <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 font-medium text-foreground">Tổng doanh thu</td>
                    <td className="px-3 py-2 text-right">{currency.format(data.revenue.reportsRevenue)}</td>
                    <td className="px-3 py-2 text-right">{currency.format(data.revenue.biRevenue)}</td>
                    <td className={`px-3 py-2 text-right ${data.revenue.delta !== 0 ? "text-amber-600 font-medium" : ""}`}>
                      {currency.format(data.revenue.delta)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {data.revenue.deltaPercent === null ? "—" : `${data.revenue.deltaPercent.toFixed(2)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Top Customers Reconciliation */}
          <section className="bg-card border border-border rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Khách hàng hàng đầu</h2>
            {data.topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="reconciliation-customers-empty">
                Không có dữ liệu khách hàng trong khoảng thời gian này
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table data-testid="reconciliation-customers-table" className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                        #
                      </th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                        Khách hàng
                      </th>
                      <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                        Reports
                      </th>
                      <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                        Business Intelligence
                      </th>
                      <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
                        Chênh lệch
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((c, i) => (
                      <tr key={c.customerId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {c.customerName}
                          <span className="text-xs text-muted-foreground ml-1">({c.customerCode})</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {c.reportsRevenue === null ? "—" : currency.format(c.reportsRevenue)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {c.biRevenue === null ? "—" : currency.format(c.biRevenue)}
                        </td>
                        <td className={`px-3 py-2 text-right ${c.delta !== 0 ? "text-amber-600 font-medium" : ""}`}>
                          {currency.format(c.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
