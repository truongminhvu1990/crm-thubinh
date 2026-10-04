// Phase 1.6B.1 - pure calendar-grid helpers for the reusable DatePicker.
//
// PRESENTATION ONLY. Nothing here knows about reporting periods, Vietnam business time, presets or any business date
// rule: it lays out the days of a calendar month and moves a highlighted day around with the keyboard. All values are
// plain "YYYY-MM-DD" strings and every calculation is pure UTC calendar arithmetic (no local timezone involved), so the
// same grid is produced in every browser and every timezone.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");

export const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const; // Monday-first, as in Vietnam

export interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Parses a REAL calendar date (2026-02-30 and 2027-02-29 are rejected). */
export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
}

const toIso = (t: Date) => `${String(t.getUTCFullYear()).padStart(4, "0")}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;

/** Day-of-week index with Monday = 0 ... Sunday = 6. */
function weekdayIndex(t: Date): number {
  return (t.getUTCDay() + 6) % 7;
}

/** Always 42 cells (6 weeks, Monday-first): the days of `month` (1-12) padded with the neighbouring months' days. */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first.getTime() - weekdayIndex(first) * 86_400_000);
  const cells: CalendarDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const t = new Date(start.getTime() + i * 86_400_000);
    cells.push({ iso: toIso(t), day: t.getUTCDate(), inMonth: t.getUTCMonth() === month - 1 && t.getUTCFullYear() === year });
  }
  return cells;
}

export function shiftDays(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return toIso(new Date(Date.UTC(p.y, p.m - 1, p.d + days)));
}

/** Same day-of-month in another month; clamps to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function shiftMonths(iso: string, months: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const target = new Date(Date.UTC(p.y, p.m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(p.d, last))));
}

export function monthLabel(year: number, month: number): string {
  return `Tháng ${month}/${year}`;
}

/** Keyboard navigation inside the grid. Returns the newly highlighted day, or null for a key that does nothing here. */
export function moveByKey(iso: string, key: string): string | null {
  const p = parseIso(iso);
  if (!p) return null;
  const idx = weekdayIndex(new Date(Date.UTC(p.y, p.m - 1, p.d)));
  switch (key) {
    case "ArrowLeft":
      return shiftDays(iso, -1);
    case "ArrowRight":
      return shiftDays(iso, 1);
    case "ArrowUp":
      return shiftDays(iso, -7);
    case "ArrowDown":
      return shiftDays(iso, 7);
    case "Home":
      return shiftDays(iso, -idx);
    case "End":
      return shiftDays(iso, 6 - idx);
    case "PageUp":
      return shiftMonths(iso, -1);
    case "PageDown":
      return shiftMonths(iso, 1);
    default:
      return null;
  }
}

/** True when `iso` lies inside the optional [min, max] bounds (inclusive; ISO strings compare chronologically). */
export function isWithin(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** Nearest allowed day to `iso` for the optional [min, max] bounds. */
export function clampIso(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}
