// Sprint v1.0.2 - Global Date Filter. The one canonical implementation of
// the filter's option set, range math, and period label - Dashboard and
// Reports both consume this instead of each computing their own.

export type DateFilterOption = "today" | "this_week" | "this_month" | "this_year" | "all_time" | "custom";

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

function addDaysToDateStr(dateStr: string, days: number): string {
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

  // this_month
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end: `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01` };
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
  if (option === "this_month") return `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

  // custom
  if (customFrom && customTo) return `${toDisplayDate(customFrom)} → ${toDisplayDate(customTo)}`;
  if (customFrom) return `Từ ${toDisplayDate(customFrom)}`;
  if (customTo) return `Đến ${toDisplayDate(customTo)}`;
  return "Tùy chọn";
}
