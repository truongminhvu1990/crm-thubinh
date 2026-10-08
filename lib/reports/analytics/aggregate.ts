import { addDays, bucketStart, enumerateBuckets, MAX_TREND_BUCKETS, normalizeDate, TrendGranularity } from "./buckets";

// Dashboard biểu đồ - Wave A (F3). The ONLY place a trend is added up: pure, no I/O. The services feed it the rows of the SAME canonical
// datasets the KPI cards and the drill-downs are built on (value per row already decided there); this function only groups them by date.

export interface TrendItem {
  /** The metric's own date column (order_date or sale_date) exactly as the canonical row carries it. */
  date: unknown;
  value: number;
}

export interface TrendPoint {
  /** First day of the bucket, "YYYY-MM-DD". */
  bucket: string;
  value: number;
}

export interface ExcludedRows {
  /** Rows whose date is not a valid calendar date (for example a 6-digit year). They are NOT in any bucket. */
  count: number;
  value: number;
}

export type TrendBuild =
  | { ok: true; points: TrendPoint[]; excluded: ExcludedRows; total: number }
  | { ok: false; reason: "too_many_buckets" };

/** `range` is the [start, end) the rows were read for (null = all time: the buckets then span the first to the last valid date).
 * Every bucket in the span is present (0 when empty) so a line is continuous. Invariant: `total` = sum(points) + excluded.value
 * = the sum of every item, i.e. the canonical total for the same rows. */
export function buildTrendPoints(items: TrendItem[], granularity: TrendGranularity, range: { start: string; end: string } | null, maxBuckets = MAX_TREND_BUCKETS): TrendBuild {
  const sums = new Map<string, number>();
  const excluded: ExcludedRows = { count: 0, value: 0 };
  let total = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const item of items) {
    const value = Number.isFinite(item.value) ? item.value : 0;
    total += value;
    const date = normalizeDate(item.date);
    if (!date) {
      excluded.count += 1;
      excluded.value += value;
      continue;
    }
    const key = bucketStart(date, granularity);
    sums.set(key, (sums.get(key) ?? 0) + value);
    if (minDate === null || date < minDate) minDate = date;
    if (maxDate === null || date > maxDate) maxDate = date;
  }

  let keys: string[];
  if (range) {
    const spans = enumerateBuckets(range.start, range.end, granularity, maxBuckets);
    if (!spans) return { ok: false, reason: "too_many_buckets" };
    keys = spans;
  } else if (minDate !== null && maxDate !== null) {
    const spans = enumerateBuckets(minDate, addDays(maxDate, 1), granularity, maxBuckets);
    if (!spans) return { ok: false, reason: "too_many_buckets" };
    keys = spans;
  } else {
    keys = [];
  }
  // A valid row can never be dropped: should one fall outside the enumerated span, its bucket is added.
  const all = new Set(keys);
  for (const k of sums.keys()) all.add(k);
  const points = [...all].sort().map((bucket) => ({ bucket, value: sums.get(bucket) ?? 0 }));
  return { ok: true, points, excluded, total };
}
