"use client";

// Sprint v1.0.2 - Global Date Filter. The one shared filter control used by
// both Dashboard and Reports (replaces the old, Reports-only
// components/reports/ReportsDateFilter.tsx). Reads/writes
// useGlobalDateFilter() directly - no props - so every screen that renders
// this component is guaranteed to be looking at the exact same state. The
// active-period label itself is shown separately, under each page's title
// (see PageViewingLabel) - not duplicated here.
//
// Phase 1.5A: the option list is the shared DATE_PRESETS (lib/dateFilter.ts), and a custom range is edited as a LOCAL
// DRAFT that is committed only by "Áp dụng" - and only when both dates are real and FROM <= TO. Typing a date, or
// choosing "Tùy chọn", therefore never changes the active period and never triggers a report request.

import { useState } from "react";
import { DATE_PRESETS, DateFilterOption, addDaysToDateStr, validateCustomRange } from "@/lib/dateFilter";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import DateInput from "@/components/shared/DateInput";

const selectClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const buttonClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium outline-none hover:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

export default function GlobalDateFilter() {
  const { option, setOption, customFrom, customTo, setCustomRange, range } = useGlobalDateFilter();
  const [editing, setEditing] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [touched, setTouched] = useState(false);

  const showCustom = editing || option === "custom";
  const fromValue = editing ? draftFrom : customFrom;
  const toValue = editing ? draftTo : customTo;
  const check = validateCustomRange(fromValue, toValue);
  // A message is shown once the user has touched a date, or as soon as both dates are filled in but wrong.
  const message = !check.ok && (touched || (fromValue && toValue)) ? check.message : null;

  function onPresetChange(next: DateFilterOption) {
    setTouched(false);
    if (next === "custom") {
      // Open the editor pre-filled from the period currently shown; the active period is NOT changed yet.
      setDraftFrom(range ? range.start : "");
      setDraftTo(range ? addDaysToDateStr(range.end, -1) : "");
      setEditing(true);
      return;
    }
    setEditing(false);
    setOption(next);
  }

  function onFromChange(value: string) {
    if (!editing) {
      setDraftTo(customTo);
      setEditing(true);
    }
    setDraftFrom(value);
    setTouched(true);
  }

  function onToChange(value: string) {
    if (!editing) {
      setDraftFrom(customFrom);
      setEditing(true);
    }
    setDraftTo(value);
    setTouched(true);
  }

  function apply() {
    if (!check.ok) {
      setTouched(true);
      return;
    }
    setCustomRange(fromValue, toValue);
    setEditing(false);
    setTouched(false);
  }

  function cancel() {
    setEditing(false);
    setTouched(false);
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <select
        data-testid="report-date-filter"
        aria-label="Chọn kỳ báo cáo"
        value={editing ? "custom" : option}
        onChange={(e) => onPresetChange(e.target.value as DateFilterOption)}
        className={selectClass}
      >
        {DATE_PRESETS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {showCustom && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <DateInput
              data-testid="report-date-filter-from"
              aria-label="Từ ngày"
              value={fromValue}
              onChange={onFromChange}
              className={selectClass}
            />
            <span className="text-muted-foreground text-sm">-</span>
            <DateInput
              data-testid="report-date-filter-to"
              aria-label="Đến ngày"
              value={toValue}
              onChange={onToChange}
              className={selectClass}
            />
            <button type="button" data-testid="report-date-filter-apply" onClick={apply} disabled={!editing || !check.ok} className={buttonClass}>
              Áp dụng
            </button>
            {editing && option !== "custom" && (
              <button type="button" data-testid="report-date-filter-cancel" onClick={cancel} className={buttonClass}>
                Hủy
              </button>
            )}
          </div>
          {message && (
            <p role="alert" data-testid="report-date-filter-error" className="text-xs text-destructive">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
