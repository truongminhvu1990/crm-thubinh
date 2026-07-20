"use client";

// Sprint v1.0.2 - Global Date Filter. The one shared filter control used by
// both Dashboard and Reports (replaces the old, Reports-only
// components/reports/ReportsDateFilter.tsx). Reads/writes
// useGlobalDateFilter() directly - no props - so every screen that renders
// this component is guaranteed to be looking at the exact same state. The
// active-period label itself is shown separately, under each page's title
// (see PageViewingLabel) - not duplicated here.

import { DateFilterOption } from "@/lib/dateFilter";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";

const OPTIONS: { value: DateFilterOption; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "this_week", label: "Tuần này" },
  { value: "this_month", label: "Tháng này" },
  { value: "this_year", label: "Năm này" },
  { value: "all_time", label: "Toàn thời gian" },
  { value: "custom", label: "Tùy chọn" },
];

const selectClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function GlobalDateFilter() {
  const { option, setOption, customFrom, customTo, setCustomRange } = useGlobalDateFilter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={option}
        onChange={(e) => setOption(e.target.value as DateFilterOption)}
        className={selectClass}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {option === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomRange(e.target.value, customTo)}
            className={selectClass}
          />
          <span className="text-muted-foreground text-sm">-</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomRange(customFrom, e.target.value)}
            className={selectClass}
          />
        </div>
      )}
    </div>
  );
}
