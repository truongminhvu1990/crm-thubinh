"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currency } from "@/lib/reports/format";
import { barChartHeight, compactMoney, truncateLabel } from "./chartFormat";

// Dashboard Wave B (F4 / F5 / F8): ONE horizontal bar chart (recharts, the library Wave A already uses). The value is always a VND amount.
// Long labels are cut on the axis and shown in full in the tooltip. A bar with an `href` opens its drill-down when clicked, and its axis
// label is a real link, so the same drill-down is reachable from the keyboard and by a screen reader.

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Extra tooltip lines (count, share, ...). */
  lines?: string[];
  /** Drill-down target; null / undefined = not clickable. */
  href?: string | null;
}

interface Props {
  data: BarDatum[];
  /** What the bar length is, e.g. "Doanh thu đã ghi nhận". */
  valueLabel: string;
  ariaLabel: string;
  testId: string;
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown; index?: number };
}

export default function HorizontalBarChart({ data, valueLabel, ariaLabel, testId }: Props) {
  const router = useRouter();
  const go = (href: string | null | undefined) => {
    if (href) router.push(href);
  };

  const renderTick = ({ x = 0, y = 0, payload }: TickProps) => {
    const datum = payload && typeof payload.index === "number" ? data[payload.index] : undefined;
    const text = datum ? truncateLabel(datum.label) : "";
    const label = (
      <text x={-4} y={0} dy={4} textAnchor="end" fontSize={11} fill="var(--foreground)">
        <title>{datum?.label}</title>
        {text}
      </text>
    );
    return (
      <g transform={`translate(${x},${y})`}>
        {datum?.href ? (
          <a
            href={datum.href}
            aria-label={`${datum.label}: xem chi tiết`}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.preventDefault();
              go(datum.href);
            }}
          >
            {label}
          </a>
        ) : (
          label
        )}
      </g>
    );
  };

  return (
    <div className="mt-3 w-full" style={{ height: barChartHeight(data.length) }} role="img" aria-label={ariaLabel} data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis type="category" dataKey="label" width={128} tick={renderTick} stroke="var(--border)" interval={0} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as BarDatum | undefined) : undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md">
                  <p className="font-semibold">{d.label}</p>
                  <p>
                    {valueLabel}: {currency.format(d.value)}
                  </p>
                  {d.lines?.map((l) => (
                    <p key={l} className="text-muted-foreground">{l}</p>
                  ))}
                  {d.href && <p className="mt-1 text-primary">Bấm để xem chi tiết</p>}
                </div>
              );
            }}
          />
          <Bar
            dataKey="value"
            fill="var(--primary)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(_: unknown, index: number) => go(data[index]?.href)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
