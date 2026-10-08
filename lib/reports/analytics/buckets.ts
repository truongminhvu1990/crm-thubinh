// Dashboard biểu đồ - Wave A (F3 Sales Trend). Pure date-bucket helpers shared by the server (aggregation) and the client (labels).
// Everything works on plain "YYYY-MM-DD" strings with UTC calendar arithmetic, so a bucket can never move because of a time zone,
// and no Date is ever built from a local time. A week starts on MONDAY (same convention as the approved "Tuần trước = Thứ Hai-Chủ Nhật").

export type TrendGranularity = "day" | "week" | "month" | "quarter" | "year";

export const TREND_GRANULARITIES: readonly TrendGranularity[] = ["day", "week", "month", "quarter", "year"];

export const GRANULARITY_LABEL: Record<TrendGranularity, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

/** Upper bound on the number of buckets one response may hold. A request that would exceed it is rejected, never silently thinned. */
export const MAX_TREND_BUCKETS = 1500;

export function isTrendGranularity(value: unknown): value is TrendGranularity {
  return typeof value === "string" && (TREND_GRANULARITIES as readonly string[]).includes(value);
}

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;

function toDateString(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A real calendar date in strict 4-digit-year form, or null. A timestamp ("2026-09-01T10:00:00Z") is reduced to its date part.
 * Anything else - a malformed value, a 6-digit year such as "111111-11-01", an impossible date - is null: the caller must put it
 * in the "excluded" bucket rather than let it create or distort a chart bucket. */
export function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** First day of the bucket that contains `date` (a valid normalized date). */
export function bucketStart(date: string, granularity: TrendGranularity): string {
  const [y, m, d] = parts(date);
  switch (granularity) {
    case "day":
      return date;
    case "week": {
      const ms = Date.UTC(y, m - 1, d);
      const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
      return toDateString(ms - sinceMonday * DAY_MS);
    }
    case "month":
      return `${String(y).padStart(4, "0")}-${pad(m)}-01`;
    case "quarter":
      return `${String(y).padStart(4, "0")}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
    case "year":
      return `${String(y).padStart(4, "0")}-01-01`;
  }
}

/** First day of the bucket that follows the one starting on `start`. */
export function nextBucketStart(start: string, granularity: TrendGranularity): string {
  const [y, m, d] = parts(start);
  switch (granularity) {
    case "day":
      return toDateString(Date.UTC(y, m - 1, d) + DAY_MS);
    case "week":
      return toDateString(Date.UTC(y, m - 1, d) + 7 * DAY_MS);
    case "month":
      return toDateString(Date.UTC(y, m, 1));
    case "quarter":
      return toDateString(Date.UTC(y, m - 1 + 3, 1));
    case "year":
      return toDateString(Date.UTC(y + 1, 0, 1));
  }
}

/** Every bucket start from the bucket containing `startDate` up to (excluding) `endExclusive`, or null when there would be more
 * than `max`. `endExclusive` is a plain date; a bucket is included when it STARTS before it. */
export function enumerateBuckets(startDate: string, endExclusive: string, granularity: TrendGranularity, max = MAX_TREND_BUCKETS): string[] | null {
  const out: string[] = [];
  let cursor = bucketStart(startDate, granularity);
  while (cursor < endExclusive) {
    out.push(cursor);
    if (out.length > max) return null;
    cursor = nextBucketStart(cursor, granularity);
  }
  return out;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return toDateString(Date.UTC(y, m - 1, d) + days * DAY_MS);
}

/** Vietnamese label of a bucket. "short" fits an axis tick, "long" is for the tooltip / table. */
export function bucketLabel(start: string, granularity: TrendGranularity, style: "short" | "long" = "short"): string {
  const [y, m, d] = parts(start);
  const dd = `${pad(d)}/${pad(m)}`;
  const full = `${pad(d)}/${pad(m)}/${y}`;
  switch (granularity) {
    case "day":
      return style === "short" ? dd : full;
    case "week":
      return style === "short" ? dd : `Tuần từ ${full}`;
    case "month":
      return style === "short" ? `Th ${m}/${y}` : `Tháng ${m}/${y}`;
    case "quarter":
      return `Quý ${Math.floor((m - 1) / 3) + 1}/${y}`;
    case "year":
      return style === "short" ? String(y) : `Năm ${y}`;
  }
}

/** The granularity the chart opens with for a period (the user can change it). `range` is [start, end) in plain dates, null = all time. */
export function defaultGranularity(range: { start: string; end: string } | null): TrendGranularity {
  if (!range) return "month";
  const [sy, sm, sd] = parts(range.start);
  const [ey, em, ed] = parts(range.end);
  const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / DAY_MS);
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  if (days <= 800) return "month";
  return "quarter";
}
