"use client";

import { DateFilterOption, DateRange } from "@/lib/dateFilter";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { SkeletonBlock } from "@/components/reports/overview/Skeleton";
import { currency } from "@/lib/reports/format";
import { METRIC_LABELS } from "@/lib/reports/overviewUi";
import type { ComparisonKey, PeriodComparison as PeriodComparisonData } from "@/lib/reports/analytics/comparison.service";

// Dashboard biểu đồ - Wave A (F1 + F2). One compact table: this period, the previous equivalent period, the absolute change and the % change.
// Numbers come from /api/reports/analytics/comparison only; nothing is computed here except formatting. While a new period loads the table is
// replaced by a skeleton (useCanonicalFetch never returns the previous URL's data).

interface Row {
  key: ComparisonKey;
  label: string;
  money: boolean;
  costOnly?: boolean;
}

const ROWS: Row[] = [
  { key: "totalOrderValue", label: METRIC_LABELS.totalOrderValue, money: true },
  { key: "orderCount", label: "Số đơn", money: false },
  { key: "sold", label: METRIC_LABELS.sold, money: true },
  { key: "soldOrderCount", label: "Số đơn đã bán", money: false },
  { key: "soldLineCount", label: "Số sản phẩm đã bán", money: false },
  { key: "avgSoldOrderValue", label: "Giá trị đơn đã bán trung bình", money: true },
  { key: "recognizedRevenue", label: METRIC_LABELS.recognizedRevenue, money: true },
  { key: "cost", label: METRIC_LABELS.cost, money: true, costOnly: true },
  { key: "grossProfit", label: METRIC_LABELS.grossProfit, money: true, costOnly: true },
];

const number = new Intl.NumberFormat("vi-VN");
const DASH = "—";

function fmt(value: number | null | undefined, money: boolean): string {
  if (value === null || value === undefined) return DASH;
  return money ? currency.format(value) : number.format(value);
}

function fmtDelta(value: number | null, money: boolean): string {
  if (value === null) return DASH;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${fmt(Math.abs(value), money)}`;
}

function fmtPercent(value: number | null): string {
  if (value === null) return DASH;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

const rangeText = (r: DateRange | null) => (r ? `${r.start} → ${r.end} (không gồm ngày cuối)` : "");

export default function PeriodComparison({ option, range, ready }: { option: DateFilterOption; range: DateRange | null; ready: boolean }) {
  const params = new URLSearchParams({ option });
  if (range) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  const { data, loading, error } = useCanonicalFetch<PeriodComparisonData>(ready ? `/api/reports/analytics/comparison?${params}` : null);

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="dashboard-period-comparison" aria-label="So sánh với kỳ trước">
      <h2 className="text-lg font-semibold text-foreground">So sánh với kỳ trước</h2>
      {loading || !ready ? (
        <div className="mt-3 space-y-2" data-testid="dashboard-period-comparison-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="dashboard-period-comparison-error">
          {error ?? "Không tải được so sánh kỳ."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="dashboard-period-comparison-note">
            {data.previousRange
              ? `Kỳ trước tương đương: ${rangeText(data.previousRange)}. “Tổng giá trị đơn hàng” và “Đã bán” tính theo ngày đơn; “Doanh thu đã ghi nhận” theo ngày bán.`
              : "Khoảng thời gian “Toàn thời gian” không có kỳ trước để so sánh."}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Chỉ số</th>
                  <th className="py-2 pr-3 text-right font-medium">Kỳ này</th>
                  <th className="py-2 pr-3 text-right font-medium">Kỳ trước</th>
                  <th className="py-2 pr-3 text-right font-medium">Chênh lệch</th>
                  <th className="py-2 text-right font-medium">% thay đổi</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.filter((r) => !r.costOnly || data.canViewCostAndProfit).map((r) => {
                  const c = data.comparison?.[r.key];
                  const delta = c?.delta ?? null;
                  const tone = delta === null || delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-secondary" : "text-destructive";
                  return (
                    <tr key={r.key} className="border-b border-border/60 last:border-0" data-testid={`dashboard-comparison-${r.key}`}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground">{r.label}</th>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{fmt(data.current[r.key], r.money)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{fmt(data.previous?.[r.key], r.money)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${tone}`}>{fmtDelta(delta, r.money)}</td>
                      <td className={`py-2 text-right tabular-nums ${tone}`}>{fmtPercent(c?.percent ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">% thay đổi chỉ hiển thị khi kỳ trước lớn hơn 0.</p>
        </>
      )}
    </section>
  );
}
