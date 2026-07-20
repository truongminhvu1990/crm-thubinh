"use client";

import { DateFilterOption } from "@/lib/reports/reports.service";

// Adds "All Time" (Customer Detail's default) alongside the exact same 5
// bounded options Reports uses. The 5 bounded values are passed straight
// through to reports.service.ts's own getDateRange() unchanged, so a shared
// value (e.g. "this_month") always produces the exact same [start, end) as
// Reports - this file never computes a date range itself.
export type CustomerDateFilterOption = "all_time" | DateFilterOption;

interface Props {
  value: CustomerDateFilterOption;
  customFrom: string;
  customTo: string;
  onChange: (value: CustomerDateFilterOption) => void;
  onCustomChange: (from: string, to: string) => void;
}

const OPTIONS: { value: CustomerDateFilterOption; label: string }[] = [
  { value: "all_time", label: "Toàn thời gian" },
  { value: "today", label: "Hôm nay" },
  { value: "this_week", label: "Tuần này" },
  { value: "this_month", label: "Tháng này" },
  { value: "this_year", label: "Năm này" },
  { value: "custom", label: "Tùy chọn" },
];

const selectClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function CustomerRevenueDateFilter({
  value,
  customFrom,
  customTo,
  onChange,
  onCustomChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CustomerDateFilterOption)}
        className={selectClass}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {value === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomChange(e.target.value, customTo)}
            className={selectClass}
          />
          <span className="text-muted-foreground text-sm">-</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomChange(customFrom, e.target.value)}
            className={selectClass}
          />
        </div>
      )}
    </div>
  );
}
