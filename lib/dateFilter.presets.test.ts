import test from "node:test";
import assert from "node:assert/strict";
import {
  DATE_PRESETS,
  DateFilterOption,
  getDateFilterLabel,
  getDateRange,
  getPreviousEquivalentRange,
  isDateFilterOption,
  validateCustomRange,
} from "./dateFilter";

// Phase 1.5A - the six new presets (Hôm qua, 7 ngày qua, Tuần trước, Tháng trước, Quý trước, Năm trước). Every expected
// value below is written out BY HAND from the calendar, not computed with the code under test. "Now" is frozen at the
// same Vietnam-time boundaries the existing dateFilter tests use (node:test Date mock).

interface Case {
  name: string;
  utcMs: number;
  yesterday: [string, string];
  last_7_days: [string, string];
  last_week: [string, string];
  last_month: [string, string];
  last_quarter: [string, string];
  last_year: [string, string];
}

const CASES: Case[] = [
  {
    name: "2026-07-24 (Friday), 23:59 Vietnam",
    utcMs: Date.parse("2026-07-24T16:59:00.000Z"),
    yesterday: ["2026-07-23", "2026-07-24"],
    last_7_days: ["2026-07-18", "2026-07-25"],
    last_week: ["2026-07-13", "2026-07-20"],
    last_month: ["2026-06-01", "2026-07-01"],
    last_quarter: ["2026-04-01", "2026-07-01"],
    last_year: ["2025-01-01", "2026-01-01"],
  },
  {
    name: "2026-07-25 (Saturday), 00:01 Vietnam (still July 24 in UTC)",
    utcMs: Date.parse("2026-07-24T17:01:00.000Z"),
    yesterday: ["2026-07-24", "2026-07-25"],
    last_7_days: ["2026-07-19", "2026-07-26"],
    last_week: ["2026-07-13", "2026-07-20"],
    last_month: ["2026-06-01", "2026-07-01"],
    last_quarter: ["2026-04-01", "2026-07-01"],
    last_year: ["2025-01-01", "2026-01-01"],
  },
  {
    name: "2026-08-01, month boundary (July -> August)",
    utcMs: Date.parse("2026-07-31T17:01:00.000Z"),
    yesterday: ["2026-07-31", "2026-08-01"],
    last_7_days: ["2026-07-26", "2026-08-02"],
    last_week: ["2026-07-20", "2026-07-27"],
    last_month: ["2026-07-01", "2026-08-01"],
    last_quarter: ["2026-04-01", "2026-07-01"],
    last_year: ["2025-01-01", "2026-01-01"],
  },
  {
    name: "2026-07-01, quarter boundary (Q2 -> Q3)",
    utcMs: Date.parse("2026-06-30T17:01:00.000Z"),
    yesterday: ["2026-06-30", "2026-07-01"],
    last_7_days: ["2026-06-25", "2026-07-02"],
    last_week: ["2026-06-22", "2026-06-29"],
    last_month: ["2026-06-01", "2026-07-01"],
    last_quarter: ["2026-04-01", "2026-07-01"],
    last_year: ["2025-01-01", "2026-01-01"],
  },
  {
    name: "2027-01-01, year boundary (2026 -> 2027)",
    utcMs: Date.parse("2026-12-31T17:01:00.000Z"),
    yesterday: ["2026-12-31", "2027-01-01"],
    last_7_days: ["2026-12-26", "2027-01-02"],
    last_week: ["2026-12-21", "2026-12-28"],
    last_month: ["2026-12-01", "2027-01-01"],
    last_quarter: ["2026-10-01", "2027-01-01"],
    last_year: ["2026-01-01", "2027-01-01"],
  },
];

const NEW_OPTIONS = ["yesterday", "last_7_days", "last_week", "last_month", "last_quarter", "last_year"] as const;

for (const c of CASES) {
  for (const option of NEW_OPTIONS) {
    test(`getDateRange("${option}") at ${c.name}`, (t) => {
      t.mock.timers.enable({ apis: ["Date"], now: c.utcMs });
      const range = getDateRange(option);
      t.mock.timers.reset();
      assert.deepEqual(range, { start: c[option][0], end: c[option][1] });
    });
  }
}

test("Tuần trước is Monday..Sunday of the previous week, and 7 ngày qua is exactly 7 days that INCLUDE today", (t) => {
  for (const c of CASES) {
    t.mock.timers.enable({ apis: ["Date"], now: c.utcMs });
    const week = getDateRange("last_week")!;
    const seven = getDateRange("last_7_days")!;
    const today = getDateRange("today")!;
    t.mock.timers.reset();
    const dow = (d: string) => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))).getDay();
    const days = (r: { start: string; end: string }) => Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000);
    assert.equal(dow(week.start), 1, `${c.name}: last week starts on Monday`);
    assert.equal(dow(week.end), 1, `${c.name}: last week's exclusive end is the next Monday`);
    assert.equal(days(week), 7);
    assert.equal(days(seven), 7);
    assert.equal(seven.end, today.end, `${c.name}: the 7 days end with today`);
  }
});

test("comparison periods (getPreviousEquivalentRange) - hand-written, Friday 2026-07-24", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CASES[0].utcMs });
  const prev = (o: DateFilterOption) => getPreviousEquivalentRange(o, getDateRange(o));
  const got = {
    yesterday: prev("yesterday"),
    last_7_days: prev("last_7_days"),
    last_week: prev("last_week"),
    last_month: prev("last_month"),
    last_quarter: prev("last_quarter"),
    last_year: prev("last_year"),
  };
  t.mock.timers.reset();
  assert.deepEqual(got.yesterday, { start: "2026-07-22", end: "2026-07-23" });
  assert.deepEqual(got.last_7_days, { start: "2026-07-11", end: "2026-07-18" }, "the 7 days immediately before");
  assert.deepEqual(got.last_week, { start: "2026-07-06", end: "2026-07-13" });
  assert.deepEqual(got.last_month, { start: "2026-05-01", end: "2026-06-01" });
  assert.deepEqual(got.last_quarter, { start: "2026-01-01", end: "2026-04-01" });
  assert.deepEqual(got.last_year, { start: "2024-01-01", end: "2025-01-01" });
});

test("comparison periods across the year boundary - hand-written, 2027-01-01", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CASES[4].utcMs });
  const prev = (o: DateFilterOption) => getPreviousEquivalentRange(o, getDateRange(o));
  const got = { y: prev("yesterday"), s: prev("last_7_days"), w: prev("last_week"), m: prev("last_month"), q: prev("last_quarter"), yr: prev("last_year") };
  t.mock.timers.reset();
  assert.deepEqual(got.y, { start: "2026-12-30", end: "2026-12-31" });
  assert.deepEqual(got.s, { start: "2026-12-19", end: "2026-12-26" });
  assert.deepEqual(got.w, { start: "2026-12-14", end: "2026-12-21" });
  assert.deepEqual(got.m, { start: "2026-11-01", end: "2026-12-01" });
  assert.deepEqual(got.q, { start: "2026-07-01", end: "2026-10-01" });
  assert.deepEqual(got.yr, { start: "2025-01-01", end: "2026-01-01" });
});

test("every comparison period ends exactly where its period starts and has the same shape (no gap, no overlap)", (t) => {
  for (const c of CASES) {
    for (const option of NEW_OPTIONS) {
      t.mock.timers.enable({ apis: ["Date"], now: c.utcMs });
      const range = getDateRange(option)!;
      const p = getPreviousEquivalentRange(option, range)!;
      t.mock.timers.reset();
      assert.equal(p.end, range.start, `${option} @ ${c.name}`);
      assert.ok(p.start < p.end);
    }
  }
});

test("an option the function does not know is shifted back by its own length - never silently treated as a year", () => {
  const p = getPreviousEquivalentRange("totally_new" as DateFilterOption, { start: "2026-07-10", end: "2026-07-13" });
  assert.deepEqual(p, { start: "2026-07-07", end: "2026-07-10" });
});

test("existing presets are untouched: all_time has no predecessor, this_* still resolve", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CASES[0].utcMs });
  assert.equal(getDateRange("all_time"), null);
  assert.equal(getPreviousEquivalentRange("all_time", null), null);
  assert.deepEqual(getDateRange("this_month"), { start: "2026-07-01", end: "2026-08-01" });
  assert.deepEqual(getPreviousEquivalentRange("this_month", getDateRange("this_month")), { start: "2026-06-01", end: "2026-07-01" });
  t.mock.timers.reset();
});

test("labels of the new presets (Friday 2026-07-24)", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CASES[0].utcMs });
  const l = (o: DateFilterOption) => getDateFilterLabel(o);
  const got = [l("yesterday"), l("last_7_days"), l("last_week"), l("last_month"), l("last_quarter"), l("last_year")];
  t.mock.timers.reset();
  assert.deepEqual(got, ["Hôm qua (23/07/2026)", "7 ngày qua (18/07 → 24/07/2026)", "Tuần trước (13/07 → 19/07/2026)", "Tháng 6/2026", "Quý 2/2026", "2025"]);
});

test("DATE_PRESETS: exactly the approved 13 options, in the approved order, with the approved Vietnamese labels", () => {
  assert.deepEqual(
    DATE_PRESETS.map((p) => p.label),
    ["Hôm nay", "Hôm qua", "7 ngày qua", "Tuần này", "Tuần trước", "Tháng này", "Tháng trước", "Quý này", "Quý trước", "Năm này", "Năm trước", "Toàn thời gian", "Tùy chọn ngày…"]
  );
  assert.equal(new Set(DATE_PRESETS.map((p) => p.value)).size, 13);
  for (const p of DATE_PRESETS) {
    assert.ok(isDateFilterOption(p.value));
    assert.doesNotThrow(() => getDateRange(p.value, "2026-07-01", "2026-07-31"));
    assert.doesNotThrow(() => getDateFilterLabel(p.value, "2026-07-01", "2026-07-31"));
  }
  assert.equal(isDateFilterOption("nope"), false);
  assert.equal(isDateFilterOption(undefined), false);
});

test("validateCustomRange: a range may be committed only when both dates are real and FROM <= TO", () => {
  assert.deepEqual(validateCustomRange("2026-08-01", "2026-08-07"), { ok: true });
  assert.deepEqual(validateCustomRange("2026-08-07", "2026-08-07"), { ok: true }, "a single day is valid");
  const missing = validateCustomRange("2026-08-01", "");
  assert.equal(missing.ok, false);
  assert.equal((missing as { message: string }).message, "Khoảng ngày không hợp lệ");
  assert.equal(validateCustomRange("", "2026-08-01").ok, false);
  assert.equal(validateCustomRange(undefined, undefined).ok, false);
  const reversed = validateCustomRange("2026-08-10", "2026-08-01");
  assert.equal(reversed.ok, false);
  assert.equal((reversed as { message: string }).message, "Khoảng ngày không hợp lệ");
  assert.equal(validateCustomRange("2026-02-30", "2026-03-01").ok, false, "2026-02-30 does not exist");
  assert.equal(validateCustomRange("08/01/2026", "2026-08-02").ok, false, "malformed");
});
