"use client";

import Link from "next/link";
import { Wallet, Coins, TrendingUp, Info } from "lucide-react";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import OverviewMetricCard from "@/components/reports/overview/OverviewMetricCard";
import PermissionGate from "@/components/reports/overview/PermissionGate";
import { SkeletonCard } from "@/components/reports/overview/Skeleton";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { usePermission } from "@/lib/hooks/useHasPermission";
import { useCanSeeCostAndProfit } from "@/lib/hooks/reportingAccess";
import { EMPTY_VALUE } from "@/lib/reports/labels.vi";
import { currency } from "@/lib/reports/format";
import { METRIC_LABELS, rangeParams, salesPageHref } from "@/lib/reports/overviewUi";
import type { PurchaseReportData } from "@/lib/reports/reports.service";

// Phase 1.4 - "Tiền & Lợi nhuận". Reads the existing canonical purchase
// report (the same object the Dashboard uses), which already carries
// totalRevenue, totalCost and totalProfit = totalRevenue - totalCost. Nothing
// is recomputed here, and commission / operating expenses are deliberately
// NOT part of Lợi nhuận gộp (the foundation does not define them there).

export default function MoneyProfitPage() {
  const { range, label, ready } = useGlobalDateFilter();
  const access = usePermission("reports.view");
  const canView = access === "allowed";
  const canSeeCost = useCanSeeCostAndProfit();
  const qs = rangeParams(range).toString();
  const { data, error } = useCanonicalFetch<PurchaseReportData>(canView && ready ? `/api/reports/purchases${qs ? `?${qs}` : ""}` : null);

  const money = (v: number | undefined) => (data && v !== undefined ? currency.format(v) : EMPTY_VALUE);
  const loading = !data && !error;

  return (
    <PermissionGate state={access} title="Tiền & Lợi nhuận">
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Tiền &amp; Lợi nhuận</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Kỳ: {label}.</p>
          <div className="mt-1.5">
            <PageViewingLabel />
          </div>
        </div>
        <GlobalDateFilter />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {loading ? (
          <>
            <SkeletonCard title={METRIC_LABELS.recognizedRevenue} />
            {canSeeCost && <SkeletonCard title={METRIC_LABELS.cost} />}
            {canSeeCost && <SkeletonCard title={METRIC_LABELS.grossProfit} />}
          </>
        ) : (
          <>
        <Link href={salesPageHref("recognized-revenue")} className="block" data-testid="money-link-recognized">
          <OverviewMetricCard
            testId="money-card-recognized"
            title={METRIC_LABELS.recognizedRevenue}
            value={money(data?.totalRevenue)}
            hint="Bấm để xem chi tiết trong Bán hàng"
            icon={<Wallet className="h-6 w-6" />}
          />
        </Link>
        {canSeeCost ? (
          <>
            <OverviewMetricCard
              testId="money-card-cost"
              title={METRIC_LABELS.cost}
              value={money(data?.totalCost)}
              hint="Giá vốn của các sản phẩm đã ghi nhận doanh thu"
              icon={<Coins className="h-6 w-6" />}
            />
            <OverviewMetricCard
              testId="money-card-gross-profit"
              title={METRIC_LABELS.grossProfit}
              value={money(data?.totalProfit)}
              hint={`${METRIC_LABELS.recognizedRevenue} − ${METRIC_LABELS.cost}`}
              icon={<TrendingUp className="h-6 w-6" />}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground md:col-span-2">Giá vốn và lợi nhuận gộp chỉ hiển thị cho Owner/Manager.</p>
        )}
          </>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Lợi nhuận gộp chưa trừ hoa hồng và chi phí vận hành. Sản phẩm chưa có giá vốn được tính giá vốn bằng 0.
      </p>
    </div>
    </PermissionGate>
  );
}
