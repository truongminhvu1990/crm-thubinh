"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import Card from "@/components/ui/Card";
import { DateRange } from "@/lib/dateFilter";
import { getRevenueTrend } from "@/lib/reports/reportsBI.service";
import { currency, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { formatDate } from "@/lib/utils";
import { RevenueTrendGranularity, RevenueTrendPoint } from "@/types/reportsBI";
import ExportButtons from "@/components/reports/ExportButtons";

// Feature 6 - Revenue Trend. A single series (revenue over time), so per
// the dataviz method a legend is unnecessary (the title already names the
// one series) - one hue (primary), a thin 2px line, a light area fill, and
// a hover crosshair + tooltip (the only accessibility layer a single-series
// line chart needs). No charting library in this project's dependencies,
// so this is a small hand-rolled SVG chart rather than adding one.

interface Props {
  range: DateRange | null;
}

const GRANULARITY_OPTIONS: { value: RevenueTrendGranularity; label: string }[] = [
  { value: "day", label: "Ngày" },
  { value: "week", label: "Tuần" },
  { value: "month", label: "Tháng" },
  { value: "year", label: "Năm" },
];

const CHART_HEIGHT = 220;
const PADDING = { top: 16, right: 12, bottom: 24, left: 12 };

function bucketLabel(bucket: string, granularity: RevenueTrendGranularity): string {
  if (granularity === "day") return formatDate(bucket);
  if (granularity === "month") {
    const [y, m] = bucket.split("-");
    return `Th ${Number(m)}/${y}`;
  }
  if (granularity === "year") return bucket.slice(0, 4);
  return formatDate(bucket); // week - labeled by its Monday start date
}

export default function RevenueTrendChart({ range }: Props) {
  const [granularity, setGranularity] = useState<RevenueTrendGranularity>("day");
  const [data, setData] = useState<RevenueTrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    getRevenueTrend(range, granularity).then((points) => {
      setData(points);
      setIsLoading(false);
      setHoverIndex(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end, granularity]);

  const innerWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  const points = useMemo(
    () =>
      data.map((d, i) => {
        const x = PADDING.left + (data.length > 1 ? (i / (data.length - 1)) * innerWidth : innerWidth / 2);
        const y = PADDING.top + innerHeight - (d.revenue / maxRevenue) * innerHeight;
        return { x, y, point: d };
      }),
    [data, innerWidth, innerHeight, maxRevenue]
  );

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${PADDING.top + innerHeight} L ${points[0].x} ${
          PADDING.top + innerHeight
        } Z`
      : "";

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <Card>
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Xu hướng doanh thu
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-input p-0.5 bg-muted/40">
            {GRANULARITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setGranularity(o.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  granularity === o.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <ExportButtons
            sheetName="Xu huong doanh thu"
            filename={`xu-huong-doanh-thu-${new Date().toISOString().slice(0, 10)}.xlsx`}
            columns={[
              { header: "Kỳ", width: 16, value: (r: RevenueTrendPoint) => bucketLabel(r.bucket, granularity) },
              { header: "Doanh thu", width: 16, value: (r: RevenueTrendPoint) => r.revenue },
              { header: "Giao dịch", width: 12, value: (r: RevenueTrendPoint) => r.transactions },
            ]}
            rows={data}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-56">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">{NO_SALES_DATA_MESSAGE}</p>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full"
          style={{ height: CHART_HEIGHT }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <svg width={width} height={CHART_HEIGHT} className="overflow-visible">
            {/* Recessive gridlines */}
            {[0, 0.5, 1].map((t) => (
              <line
                key={t}
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={PADDING.top + innerHeight * t}
                y2={PADDING.top + innerHeight * t}
                className="text-border"
                stroke="currentColor"
                strokeWidth={1}
              />
            ))}

            <path d={areaPath} className="text-primary" fill="currentColor" fillOpacity={0.08} stroke="none" />
            <path
              d={linePath}
              className="text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {hovered && (
              <>
                <line
                  x1={hovered.x}
                  x2={hovered.x}
                  y1={PADDING.top}
                  y2={PADDING.top + innerHeight}
                  className="text-border"
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={hovered.x}
                  cy={hovered.y}
                  r={4}
                  className="text-primary"
                  fill="currentColor"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              </>
            )}

            {/* First/last x-axis labels only, to keep the axis recessive and
                uncluttered - the hover tooltip covers every other point. */}
            {points.length > 0 && (
              <>
                <text
                  x={points[0].x}
                  y={CHART_HEIGHT - 6}
                  className="text-muted-foreground text-[10px]"
                  fill="currentColor"
                  textAnchor="start"
                >
                  {bucketLabel(points[0].point.bucket, granularity)}
                </text>
                <text
                  x={points[points.length - 1].x}
                  y={CHART_HEIGHT - 6}
                  className="text-muted-foreground text-[10px]"
                  fill="currentColor"
                  textAnchor="end"
                >
                  {bucketLabel(points[points.length - 1].point.bucket, granularity)}
                </text>
              </>
            )}
          </svg>

          {hovered && (
            <div
              className="absolute pointer-events-none bg-card border border-border rounded-lg shadow-md px-3 py-2 text-xs -translate-x-1/2"
              style={{
                left: Math.min(Math.max(hovered.x, 70), width - 70),
                top: Math.max(hovered.y - 64, 0),
              }}
            >
              <p className="font-medium text-foreground">{bucketLabel(hovered.point.bucket, granularity)}</p>
              <p className="text-muted-foreground mt-0.5">Doanh thu: {currency.format(hovered.point.revenue)}</p>
              <p className="text-muted-foreground">Giao dịch: {hovered.point.transactions}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
