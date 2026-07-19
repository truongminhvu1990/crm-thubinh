"use client";

import { useState } from "react";
import { MonthlyPoint } from "@/lib/marketIntelligence/marketIntelligence.service";

interface Props {
  data: MonthlyPoint[];
  metric: "purchaseCount" | "revenue";
  formatValue: (value: number) => string;
  formatMonth: (month: string) => string;
  color?: string;
}

const W = 600;
const H = 200;
const PAD_X = 24;
const PAD_Y = 20;

/**
 * A single-series Line Chart - the only chart type this module uses
 * (MARKET_INTELLIGENCE_UI.md Decision 3). Hand-rolled SVG, no charting
 * library added to the project (Decision 4 - the chart shape is specified,
 * the library choice is deliberately not made here). X-axis is always
 * calendar month (Spec §2.4-2.5, Decision 4) - no zoom, no other
 * granularity. Hovering/tapping a point reveals its exact value.
 */
export default function LineChart({ data, metric, formatValue, formatMonth, color = "var(--primary)" }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const values = data.map((d) => d[metric]);
  const max = Math.max(1, ...values);

  const points = data.map((d, i) => {
    const x = data.length === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (data.length - 1);
    const y = H - PAD_Y - (d[metric] / max) * (H - 2 * PAD_Y);
    return { x, y, month: d.month, value: d[metric] };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const active = activeIndex !== null ? points[activeIndex] : null;

  return (
    <div className="relative w-full" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
        role="img"
        aria-label="Biểu đồ đường theo tháng"
      >
        <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="var(--border)" strokeWidth={1} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={p.month}
            cx={p.x}
            cy={p.y}
            r={activeIndex === i ? 5 : 3.5}
            fill={color}
            className="cursor-pointer"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={() => setActiveIndex(activeIndex === i ? null : i)}
          />
        ))}
      </svg>

      {active && (
        <div
          className="absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm pointer-events-none"
          style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
        >
          <p className="font-medium text-foreground">{formatMonth(active.month)}</p>
          <p className="text-muted-foreground">{formatValue(active.value)}</p>
        </div>
      )}

      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-1">
        <span>{formatMonth(data[0]?.month)}</span>
        {data.length > 1 && <span>{formatMonth(data[data.length - 1]?.month)}</span>}
      </div>
    </div>
  );
}
