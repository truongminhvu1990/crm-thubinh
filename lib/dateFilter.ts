// Sprint v1.0.2 - Global Date Filter. The one canonical implementation of
// the filter's option set, range math, and period label - Dashboard and
// Reports both consume this instead of each computing their own.

export type DateFilterOption =
  | "today"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "all_time"
  | "custom";

export interface DateRange {
  start: string; // inclusive, YYYY-MM-DD
  end: string; // exclusive, YYYY-MM-DD
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Exported so callers outside this module (e.g. the Reports BI Center's
 * drill-down links, lib/reports/drilldown.ts) can convert an exclusive
 * DateRange.end back into an inclusive "to" date for the Global Date
 * Filter's Custom Range inputs, without re-implementing this day math. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

function toDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Computes the [start, end) range for every option except "all_time", which
 * returns `null` - a real absence of filter (no query bound applied), not a
 * hardcoded wide date span. This Week starts on Monday. Custom Range treats
 * `to` as inclusive (end = to + 1 day).
 */
export function getDateRange(option: DateFilterOption, customFrom?: string, customTo?: string): DateRange | null {
  const now = new Date();

  if (option === "all_time") {
    return null;
  }

  if (option === "custom") {
    const start = customFrom || toDateStr(now);
    const end = customTo ? addDaysToDateStr(customTo, 1) : addDaysToDateStr(start, 1);
    return { start, end };
  }

  if (option === "today") {
    const start = toDateStr(now);
    return { start, end: addDaysToDateStr(start, 1) };
  }

  if (option === "this_week") {
    const day = now.getDay(); // 0 = Sunday .. 6 = Saturday
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    const start = toDateStr(monday);
    return { start, end: addDaysToDateStr(start, 7) };
  }

  if (option === "this_year") {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear() + 1}-01-01` };
  }

  if (option === "this_quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = `${now.getFullYear()}-${pad(quarterStartMonth + 1)}-01`;
    const nextQuarter = new Date(now.getFullYear(), quarterStartMonth + 3, 1);
    return { start, end: `${nextQuarter.getFullYear()}-${pad(nextQuarter.getMonth() + 1)}-01` };
  }

  // this_month
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end: `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01` };
}

/**
 * Sprint v2.2.0 Revision 1, Decision 18/19 - Comparison Periods/KPI. The
 * "previous equivalent period" for whatever option/range is currently
 * active: Today -> Yesterday, This Week -> Last Week, This Month -> Last
 * Month, This Quarter -> Last Quarter, This Year -> Last Year, Custom ->
 * "previous period with identical duration" (the task's own wording).
 * All Time has no meaningful predecessor, so it returns `null`, same as
 * getDateRange()'s own "no bound" semantics.
 *
 * Today/This Week/Custom are computed by shifting the whole [start, end)
 * window back by its own length in days - correct for them since every
 * day in a week is the same length. This Month/This Quarter/This Year
 * instead step back by calendar unit (anchored on `range.start`, always
 * the 1st of the period) rather than day-count, since a day-shift would
 * silently corrupt months/quarters of different lengths (e.g. Feb vs Jan).
 */
export function getPreviousEquivalentRange(option: DateFilterOption, range: DateRange | null): DateRange | null {
  if (!range || option === "all_time") return null;

  if (option === "today" || option === "this_week" || option === "custom") {
    const [sy, sm, sd] = range.start.split("-").map(Number);
    const [ey, em, ed] = range.end.split("-").map(Number);
    const durationDays = Math.round(
      (new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime()) / 86_400_000
    );
    return { start: addDaysToDateStr(range.start, -durationDays), end: range.start };
  }

  const [y, m] = range.start.split("-").map(Number);

  if (option === "this_month") {
    const prev = new Date(y, m - 2, 1);
    return { start: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`, end: range.start };
  }

  if (option === "this_quarter") {
    const prev = new Date(y, m - 1 - 3, 1);
    return { start: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`, end: range.start };
  }

  // this_year
  return { start: `${y - 1}-01-01`, end: range.start };
}

/**
 * Human-readable label for the currently selected period - always shown
 * next to the filter so no screen leaves the user guessing what period
 * they're viewing.
 */
export function getDateFilterLabel(option: DateFilterOption, customFrom?: string, customTo?: string): string {
  const now = new Date();

  if (option === "all_time") return "Toàn thời gian";
  if (option === "today") return "Hôm nay";
  if (option === "this_week") return "Tuần này";
  if (option === "this_year") return `${now.getFullYear()}`;
  if (option === "this_quarter") return `Quý ${Math.floor(now.getMonth() / 3) + 1}/${now.getFullYear()}`;
  if (option === "this_month") return `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

  // custom
  if (customFrom && customTo) return `${toDisplayDate(customFrom)} → ${toDisplayDate(customTo)}`;
  if (customFrom) return `Từ ${toDisplayDate(customFrom)}`;
  if (customTo) return `Đến ${toDisplayDate(customTo)}`;
  return "Tùy chọn";
}
