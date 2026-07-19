"use client";

import { DateFilterOption } from "@/lib/reports/reports.service";

interface Props {
  value: DateFilterOption;
  customFrom: string;
  customTo: string;
  onChange: (value: DateFilterOption) => void;
  onCustomChange: (from: string, to: string) => void;
}

const OPTIONS: { value: DateFilterOption; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "this_week", label: "Tuần này" },
  { value: "this_month", label: "Tháng này" },
  { value: "this_year", label: "Năm này" },
  { value: "custom", label: "Tùy chọn" },
];

const selectClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function ReportsDateFilter({ value, customFrom, customTo, onChange, onCustomChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={value} onChange={(e) => onChange(e.target.value as DateFilterOption)} className={selectClass}>
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
