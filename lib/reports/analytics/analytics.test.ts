import test from "node:test";
import assert from "node:assert/strict";
import { bucketStart, defaultGranularity, enumerateBuckets, nextBucketStart, normalizeDate, bucketLabel } from "./buckets";
import { buildTrendPoints } from "./aggregate";
import { computeDelta, safeRatio } from "./delta";

test("normalizeDate accepts real dates/timestamps and rejects the 6-digit-year row", () => {
  assert.equal(normalizeDate("2026-09-30"), "2026-09-30");
  assert.equal(normalizeDate("2026-09-30T10:00:00Z"), "2026-09-30");
  assert.equal(normalizeDate("111111-11-01"), null);
  assert.equal(normalizeDate("2026-02-30"), null);
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate("abc"), null);
});

test("bucketStart: week starts Monday, quarter/month/year start on the 1st", () => {
  assert.equal(bucketStart("2026-10-04", "week"), "2026-09-28"); // Sunday -> previous Monday
  assert.equal(bucketStart("2026-09-28", "week"), "2026-09-28");
  assert.equal(bucketStart("2026-05-17", "month"), "2026-05-01");
  assert.equal(bucketStart("2026-05-17", "quarter"), "2026-04-01");
  assert.equal(bucketStart("2026-12-31", "quarter"), "2026-10-01");
  assert.equal(bucketStart("2026-12-31", "year"), "2026-01-01");
  assert.equal(nextBucketStart("2026-10-01", "quarter"), "2027-01-01");
  assert.equal(nextBucketStart("2026-12-01", "month"), "2027-01-01");
});

test("enumerateBuckets covers the range and refuses to exceed the cap", () => {
  assert.deepEqual(enumerateBuckets("2026-09-01", "2026-10-01", "week"), ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  assert.deepEqual(enumerateBuckets("2026-01-01", "2027-01-01", "quarter"), ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]);
  assert.equal(enumerateBuckets("2000-01-01", "2026-01-01", "day"), null);
});

test("buildTrendPoints: continuous buckets, sum of buckets + excluded equals the total, bad date is disclosed not bucketed", () => {
  const items = [
    { date: "2026-09-02", value: 100 },
    { date: "2026-09-02", value: 50 },
    { date: "2026-09-20", value: 25 },
    { date: "111111-11-01", value: 18_000_000 },
  ];
  const r = buildTrendPoints(items, "month", null);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.points, [{ bucket: "2026-09-01", value: 175 }]);
  assert.deepEqual(r.excluded, { count: 1, value: 18_000_000 });
  assert.equal(r.total, 175 + 18_000_000);
  const sum = r.points.reduce((s, p) => s + p.value, 0) + r.excluded.value;
  assert.equal(sum, r.total);
});

test("buildTrendPoints with a range fills empty buckets with 0; every granularity keeps the total", () => {
  const items = [
    { date: "2026-07-15", value: 10 },
    { date: "2026-09-30", value: 5 },
  ];
  for (const g of ["day", "week", "month", "quarter", "year"] as const) {
    const r = buildTrendPoints(items, g, { start: "2026-07-01", end: "2026-10-01" });
    assert.ok(r.ok, g);
    if (!r.ok) continue;
    assert.equal(r.points.reduce((s, p) => s + p.value, 0), 15, g);
  }
  const m = buildTrendPoints(items, "month", { start: "2026-07-01", end: "2026-10-01" });
  assert.ok(m.ok);
  if (m.ok) assert.deepEqual(m.points.map((p) => p.value), [10, 0, 5]);
});

test("buildTrendPoints rejects an over-long span instead of thinning it", () => {
  const r = buildTrendPoints([], "day", { start: "2000-01-01", end: "2026-01-01" });
  assert.deepEqual(r, { ok: false, reason: "too_many_buckets" });
});

test("computeDelta: % only with a positive previous value", () => {
  assert.deepEqual(computeDelta(150, 100), { current: 150, previous: 100, delta: 50, percent: 50 });
  assert.equal(computeDelta(50, 100).percent, -50);
  assert.equal(computeDelta(100, 0).percent, null);
  assert.equal(computeDelta(100, 0).delta, 100);
  assert.equal(computeDelta(100, -5).percent, null);
  assert.deepEqual(computeDelta(null, 10), { current: null, previous: 10, delta: null, percent: null });
});

test("safeRatio is null without a positive denominator", () => {
  assert.equal(safeRatio(100, 0), null);
  assert.equal(safeRatio(100, 4), 25);
});

test("labels and default granularity", () => {
  assert.equal(bucketLabel("2026-10-01", "quarter"), "Quý 4/2026");
  assert.equal(bucketLabel("2026-09-01", "month", "long"), "Tháng 9/2026");
  assert.equal(defaultGranularity({ start: "2026-09-01", end: "2026-10-01" }), "day");
  assert.equal(defaultGranularity({ start: "2026-01-01", end: "2027-01-01" }), "month");
  assert.equal(defaultGranularity(null), "month");
});
