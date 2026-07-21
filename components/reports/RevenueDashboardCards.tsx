"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { getDateRange } from "@/lib/dateFilter";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { getRevenuePeriods, getRevenueSummary } from "@/lib/reports/reportsBI.service";
import { buildSalesLedgerHref } from "@/lib/reports/drilldown";
import { currency, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { RevenuePeriodKey, RevenuePeriodRow, RevenueSummary } from "@/types/reportsBI";

// Feature 1 - Revenue Dashboard. Five cards are fixed calendar periods
// (Today/This Week/This Month/This Quarter/This Year) computed server-side
// from now() - they deliberately do NOT follow the Global Date Filter's
// selected option, so the dashboard always shows "how is today/this month
// doing" regardless of what period the rest of the page is scoped to. The
// sixth card, Custom Range, is the one exception: it reads the Global Date
// Filter's own customFrom/customTo (Feature 12 - reusing it, not adding a
// second date picker) whenever they're set, independent of whether "Tùy
// chọn" is the currently active option.

const PERIOD_ORDER: RevenuePeriodKey[] = ["today", "this_week", "this_month", "this_quarter", "this_year"];

const PERIOD_LABEL: Record<RevenuePeriodKey, string> = {
  today: "Hôm nay",
  this_week: "Tuần này",
  this_month: "Tháng này",
  this_quarter: "Quý này",
  this_year: "Năm này",
};

function MetricCard({
  title,
  data,
  href,
}: {
  title: string;
  data: { revenue: number; transactions: number; avgSale: number } | null;
  href: string;
}) {
  // Decision 20 - Empty State: once loaded, zero transactions means "no
  // sales data", not a literal 0 - `data === null` (still loading, or no
  // custom range set) is a separate case and keeps the "—" placeholder.
  const isEmpty = data !== null && data.transactions === 0;

  return (
    <Link href={href} className="block h-full">
      <Card className="h-full hover:border-primary/40 hover:shadow-md transition-shadow cursor-pointer">
        <p className="text-sm text-muted-foreground">{title}</p>
        {isEmpty ? (
          <p className="text-xs text-muted-foreground mt-3">{NO_SALES_DATA_MESSAGE}</p>
        ) : (
          <>
            <p className="text-xl font-bold text-foreground mt-1.5">
              {data ? currency.format(data.revenue) : "—"}
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{data ? `${data.transactions} giao dịch` : "—"}</span>
              <span>{data ? `TB ${currency.format(data.avgSale)}` : "—"}</span>
            </div>
          </>
        )}
      </Card>
    </Link>
  );
}

export default function RevenueDashboardCards() {
  const { customFrom, customTo } = useGlobalDateFilter();
  const [periods, setPeriods] = useState<RevenuePeriodRow[] | null>(null);
  const [customSummary, setCustomSummary] = useState<RevenueSummary | null>(null);

  useEffect(() => {
    getRevenuePeriods().then(setPeriods);
  }, []);

  const hasCustomRange = !!(customFrom || customTo);
  const customRange = hasCustomRange ? getDateRange("custom", customFrom, customTo) : null;

  useEffect(() => {
    // No custom range set -> nothing to fetch; the render below already
    // gates the Custom Range card on `hasCustomRange`, so leaving any stale
    // customSummary in state here is harmless (it simply never renders).
    if (!customRange) return;
    getRevenueSummary(customRange).then(setCustomSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRange?.start, customRange?.end]);

  const byKey = new Map((periods || []).map((p) => [p.period_key, p]));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {PERIOD_ORDER.map((key) => {
        const p = byKey.get(key);
        return (
          <MetricCard
            key={key}
            title={PERIOD_LABEL[key]}
            data={p ? { revenue: p.revenue, transactions: p.transactions, avgSale: p.avg_sale } : null}
            href={
              p
                ? buildSalesLedgerHref({ dateRange: { start: p.period_start, end: p.period_end } })
                : "/reports/sales-ledger"
            }
          />
        );
      })}
      <MetricCard
        title="Tùy chọn"
        data={
          hasCustomRange && customSummary
            ? { revenue: customSummary.revenue, transactions: customSummary.transactions, avgSale: customSummary.avg_sale }
            : null
        }
        href={customRange ? buildSalesLedgerHref({ dateRange: customRange }) : "/reports/sales-ledger"}
      />
    </div>
  );
}
