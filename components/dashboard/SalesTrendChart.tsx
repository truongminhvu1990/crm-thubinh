"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DateRange } from "@/lib/dateFilter";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { SkeletonBlock } from "@/components/reports/overview/Skeleton";
import { currency, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { METRIC_LABELS } from "@/lib/reports/overviewUi";
import { bucketLabel, defaultGranularity, GRANULARITY_LABEL, TREND_GRANULARITIES, TrendGranularity } from "@/lib/reports/analytics/buckets";
import type { SalesTrend, TrendMetric } from "@/lib/reports/analytics/trend.service";

// Dashboard biểu đồ - Wave A (F3). A single recharts LineChart over /api/reports/analytics/trend (canonical rows grouped by the metric's own date).
// The data of a previous period/metric/granularity is never drawn: useCanonicalFetch returns data only for the CURRENT url.

const METRIC_OPTIONS: { value: TrendMetric; label: string; costOnly?: boolean }[] = [
  { value: "totalOrderValue", label: METRIC_LABELS.totalOrderValue },
  { value: "sold", label: METRIC_LABELS.sold },
  { value: "recognizedRevenue", label: METRIC_LABELS.recognizedRevenue },
  { value: "grossProfit", label: METRIC_LABELS.grossProfit, costOnly: true },
];

const DATE_BASIS_TEXT = {
  order_date: "Theo ngày đơn",
  sale_date: "Theo ngày bán",
} as const;

function compactMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1).replace(".", ",")} tỷ`;
  if (abs >= 1e6) return `${Math.round(v / 1e6)} tr`;
  if (abs >= 1e3) return `${Math.round(v / 1e3)} k`;
  return String(v);
}

interface Props {
  range: DateRange | null;
  ready: boolean;
  canViewCostAndProfit: boolean;
}

export default function SalesTrendChart({ range, ready, canViewCostAndProfit }: Props) {
  const rangeKey = range ? `${range.start}|${range.end}` : "all";
  const [metric, setMetric] = useState<TrendMetric>("recognizedRevenue");
  const [pick, setPick] = useState<{ key: string; g: TrendGranularity } | null>(null);
  // A manual granularity choice belongs to the period it was made in; a new period goes back to a sensible default.
  const granularity: TrendGranularity = pick && pick.key === rangeKey ? pick.g : defaultGranularity(range);
  const activeMetric: TrendMetric = metric === "grossProfit" && !canViewCostAndProfit ? "recognizedRevenue" : metric;

  const params = new URLSearchParams({ metric: activeMetric, granularity });
  if (range) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  const { data, loading, error } = useCanonicalFetch<SalesTrend>(ready ? `/api/reports/analytics/trend?${params}` : null);

  const hasData = !!data && (data.points.some((p) => p.value !== 0) || data.excluded.count > 0 || data.total !== 0);
  const chartData = data?.points.map((p) => ({ ...p, label: bucketLabel(p.bucket, data.granularity, "short"), long: bucketLabel(p.bucket, data.granularity, "long") })) ?? [];
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === activeMetric)?.label ?? "";

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="dashboard-sales-trend" aria-label="Xu hướng bán hàng">
      <h2 className="text-lg font-semibold text-foreground">Xu hướng bán hàng</h2>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span id="trend-metric-caption" className="text-sm font-medium text-muted-foreground sm:w-24">Chỉ số</span>
          <div role="group" aria-labelledby="trend-metric-caption" className="flex flex-wrap gap-2" data-testid="trend-metric">
            {METRIC_OPTIONS.filter((m) => !m.costOnly || canViewCostAndProfit).map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={m.value === activeMetric}
                data-testid={`trend-metric-${m.value}`}
                onClick={() => setMetric(m.value)}
                className={`rounded-md border px-3 py-1.5 text-sm ${m.value === activeMetric ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span id="trend-granularity-caption" className="text-sm font-medium text-muted-foreground sm:w-24">Độ chi tiết</span>
          <div role="group" aria-labelledby="trend-granularity-caption" className="flex w-fit max-w-full overflow-hidden rounded-md border border-border" data-testid="trend-granularity">
            {TREND_GRANULARITIES.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === granularity}
                data-testid={`trend-granularity-${g}`}
                onClick={() => setPick({ key: rangeKey, g })}
                className={`px-2.5 py-1.5 text-sm ${g === granularity ? "bg-primary font-semibold text-primary-foreground" : "bg-background text-foreground"}`}
              >
                {GRANULARITY_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground" data-testid="trend-basis">
        {DATE_BASIS_TEXT[data?.dateBasis ?? (activeMetric === "totalOrderValue" || activeMetric === "sold" ? "order_date" : "sale_date")]}
        {activeMetric === "recognizedRevenue" || activeMetric === "grossProfit" ? " (Doanh thu đã ghi nhận được tính theo ngày bán, không phải ngày đơn)" : ""}
      </p>

      {loading || !ready ? (
        <SkeletonBlock className="mt-3 h-64 w-full" />
      ) : error || !data ? (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="trend-error">{error ?? "Không tải được xu hướng."}</p>
      ) : !hasData ? (
        <p className="mt-3 py-10 text-center text-sm text-muted-foreground" data-testid="trend-empty">{NO_SALES_DATA_MESSAGE}</p>
      ) : (
        <>
          <div
            className="mt-3 h-64 w-full"
            role="img"
            aria-label={`Biểu đồ đường ${metricLabel} theo ${GRANULARITY_LABEL[data.granularity].toLowerCase()}, tổng ${currency.format(data.total)}`}
            data-testid="trend-chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" minTickGap={16} />
                <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" width={56} />
                <Tooltip
                  formatter={(v) => [currency.format(Number(v)), metricLabel]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.long ?? ""}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={chartData.length <= 40} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="trend-total">
            Tổng trong kỳ: <span className="font-semibold text-foreground">{currency.format(data.total)}</span> (khớp thẻ chỉ số tương ứng)
          </p>
          {data.excluded.count > 0 && (
            <p className="mt-1 text-xs text-destructive" role="status" data-testid="trend-excluded">
              {data.excluded.count} dòng có ngày không hợp lệ ({currency.format(data.excluded.value)}) được tính vào tổng nhưng không nằm trong biểu đồ.
            </p>
          )}
          {typeof data.missingCostLines === "number" && data.missingCostLines > 0 && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="trend-missing-cost">
              {data.missingCostLines} dòng chưa có giá vốn (tính giá vốn = 0, giống thẻ Lợi nhuận gộp) nên lợi nhuận có thể cao hơn thực tế.
            </p>
          )}
        </>
      )}
    </section>
  );
}
