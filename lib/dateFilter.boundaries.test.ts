import test from "node:test";
import assert from "node:assert/strict";
import { DateFilterOption, getDateRange, getPreviousEquivalentRange, validateCustomRange, INVALID_RANGE_MESSAGE } from "./dateFilter";
import { DrilldownView, activeDrilldownRange, parseDrilldownRange } from "./reports/drilldown";

/**
 * Phase 1.6B - boundary coverage for the locked preset semantics (Vietnam time, [start, end) with end exclusive).
 * Every expectation is written out BY HAND from the calendar. "Now" is frozen at 12:00 Vietnam time (05:00Z) on:
 *   2028-02-29 Tue (leap day)   2028-03-01 Wed (day after the leap day)
 *   2026-12-31 Thu (year end)   2026-01-01 Thu (year start; its week began Mon 2025-12-29)
 */
const at = (isoDate: string) => Date.parse(`${isoDate}T05:00:00.000Z`);

type Expect = Partial<Record<DateFilterOption, [string, string]>>;
const CASES: { name: string; now: number; expect: Expect }[] = [
  {
    name: "2028-02-29 Tue (leap day)",
    now: at("2028-02-29"),
    expect: {
      today: ["2028-02-29", "2028-03-01"],
      yesterday: ["2028-02-28", "2028-02-29"],
      last_7_days: ["2028-02-23", "2028-03-01"],
      this_week: ["2028-02-28", "2028-03-06"],
      last_week: ["2028-02-21", "2028-02-28"],
      this_month: ["2028-02-01", "2028-03-01"],
      last_month: ["2028-01-01", "2028-02-01"],
      this_quarter: ["2028-01-01", "2028-04-01"],
      last_quarter: ["2027-10-01", "2028-01-01"],
      this_year: ["2028-01-01", "2029-01-01"],
      last_year: ["2027-01-01", "2028-01-01"],
    },
  },
  {
    name: "2028-03-01 Wed (the month after a leap February)",
    now: at("2028-03-01"),
    expect: {
      today: ["2028-03-01", "2028-03-02"],
      yesterday: ["2028-02-29", "2028-03-01"],
      last_7_days: ["2028-02-24", "2028-03-02"],
      this_week: ["2028-02-28", "2028-03-06"],
      last_week: ["2028-02-21", "2028-02-28"],
      this_month: ["2028-03-01", "2028-04-01"],
      last_month: ["2028-02-01", "2028-03-01"], // 29 days
      this_quarter: ["2028-01-01", "2028-04-01"],
      last_quarter: ["2027-10-01", "2028-01-01"],
    },
  },
  {
    name: "2026-12-31 Thu (last day of the year / Q4 / December)",
    now: at("2026-12-31"),
    expect: {
      today: ["2026-12-31", "2027-01-01"],
      yesterday: ["2026-12-30", "2026-12-31"],
      last_7_days: ["2026-12-25", "2027-01-01"],
      this_week: ["2026-12-28", "2027-01-04"],
      last_week: ["2026-12-21", "2026-12-28"],
      this_month: ["2026-12-01", "2027-01-01"],
      last_month: ["2026-11-01", "2026-12-01"],
      this_quarter: ["2026-10-01", "2027-01-01"],
      last_quarter: ["2026-07-01", "2026-10-01"],
      this_year: ["2026-01-01", "2027-01-01"],
      last_year: ["2025-01-01", "2026-01-01"],
    },
  },
  {
    name: "2026-01-01 Thu (first day of the year / Q1 / January)",
    now: at("2026-01-01"),
    expect: {
      today: ["2026-01-01", "2026-01-02"],
      yesterday: ["2025-12-31", "2026-01-01"],
      last_7_days: ["2025-12-26", "2026-01-02"],
      this_week: ["2025-12-29", "2026-01-05"], // the week started in the previous year
      last_week: ["2025-12-22", "2025-12-29"],
      this_month: ["2026-01-01", "2026-02-01"],
      last_month: ["2025-12-01", "2026-01-01"],
      this_quarter: ["2026-01-01", "2026-04-01"],
      last_quarter: ["2025-10-01", "2026-01-01"],
      this_year: ["2026-01-01", "2027-01-01"],
      last_year: ["2025-01-01", "2026-01-01"],
    },
  },
];

for (const c of CASES) {
  test(`presets - ${c.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: c.now });
    const got: Record<string, unknown> = {};
    for (const option of Object.keys(c.expect) as DateFilterOption[]) {
      const r = getDateRange(option);
      got[option] = r ? [r.start, r.end] : null;
    }
    t.mock.timers.reset();
    assert.deepEqual(got, c.expect);
  });
}

test("every period preset covers whole days and contains 'today' only when it is a 'this/today/7 days' preset", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: at("2028-02-29") });
  const today = "2028-02-29";
  const containing: DateFilterOption[] = ["today", "last_7_days", "this_week", "this_month", "this_quarter", "this_year"];
  const notContaining: DateFilterOption[] = ["yesterday", "last_week", "last_month", "last_quarter", "last_year"];
  const inRange = (o: DateFilterOption) => {
    const r = getDateRange(o)!;
    return r.start <= today && today < r.end;
  };
  const a = containing.map(inRange);
  const b = notContaining.map(inRange);
  t.mock.timers.reset();
  assert.ok(a.every(Boolean), "this_* / today / last_7_days include today");
  assert.ok(b.every((x) => !x), "yesterday / last_* never include today");
});

test("'7 ngày qua' is exactly 7 calendar days including today; 'Tuần trước' is Monday..Sunday (7 days)", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: at("2026-12-31") });
  const days = (o: DateFilterOption) => {
    const r = getDateRange(o)!;
    return Math.round((Date.parse(`${r.end}T00:00:00Z`) - Date.parse(`${r.start}T00:00:00Z`)) / 86_400_000);
  };
  const lastWeek = getDateRange("last_week")!;
  const out = { d7: days("last_7_days"), week: days("last_week"), startDow: new Date(`${lastWeek.start}T00:00:00Z`).getUTCDay() };
  t.mock.timers.reset();
  assert.equal(out.d7, 7);
  assert.equal(out.week, 7);
  assert.equal(out.startDow, 1, "Monday");
});

test("'previous equivalent' windows stay gap-free over a leap February and a year boundary", (t) => {
  for (const c of CASES) {
    for (const option of ["this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year", "this_week", "last_week"] as DateFilterOption[]) {
      t.mock.timers.enable({ apis: ["Date"], now: c.now });
      const range = getDateRange(option)!;
      const p = getPreviousEquivalentRange(option, range)!;
      t.mock.timers.reset();
      assert.equal(p.end, range.start, `${option} @ ${c.name}`);
    }
  }
});

test("custom range: end is inclusive 'to' + 1 day, across a leap day and a year boundary", () => {
  assert.deepEqual(getDateRange("custom", "2028-02-28", "2028-02-29"), { start: "2028-02-28", end: "2028-03-01" });
  assert.deepEqual(getDateRange("custom", "2026-12-31", "2027-01-01"), { start: "2026-12-31", end: "2027-01-02" });
  assert.deepEqual(getDateRange("custom", "2026-09-01", "2026-09-30"), { start: "2026-09-01", end: "2026-10-01" });
});

test("validateCustomRange: leap days and the single error message", () => {
  assert.deepEqual(validateCustomRange("2028-02-29", "2028-02-29"), { ok: true });
  for (const [from, to] of [
    ["2027-02-29", "2027-03-01"], // 2027 is not a leap year
    ["2100-02-29", "2100-03-01"], // 2100 is not a leap year (century rule)
    ["2026-09-30", "2026-09-01"], // reversed
    ["", "2026-09-01"],
    ["2026-09-01", ""],
    ["01/09/2026", "30/09/2026"], // display format is never an API value
  ]) {
    const r = validateCustomRange(from, to);
    assert.equal(r.ok, false, `${from} -> ${to}`);
    assert.equal((r as { message: string }).message, INVALID_RANGE_MESSAGE);
  }
  assert.equal(INVALID_RANGE_MESSAGE, "Khoảng ngày không hợp lệ");
});

test("drill-down range is VIEW context: parsed from the URL, in force only over the period it was opened on", () => {
  const params = new URLSearchParams("dateFrom=2026-09-01&dateTo=2026-10-01&customer=KH01");
  const view = parseDrilldownRange(params);
  assert.deepEqual(view, { range: { start: "2026-09-01", end: "2026-10-01" }, baseKey: null });

  // before the saved period is known (baseKey null) it is in force
  assert.deepEqual(activeDrilldownRange(view, "2026-10-01|2026-11-01"), { start: "2026-09-01", end: "2026-10-01" });

  // once pinned to the saved period, it holds while that period is unchanged ...
  const pinned: DrilldownView = { ...view!, baseKey: "2026-10-01|2026-11-01" };
  assert.deepEqual(activeDrilldownRange(pinned, "2026-10-01|2026-11-01"), pinned.range);
  // ... and hands control back as soon as the user picks another period
  assert.equal(activeDrilldownRange(pinned, "2026-09-01|2026-10-01"), null);
  assert.equal(activeDrilldownRange(pinned, "all|all"), null);

  // a half-specified or absent range is not a drill-down range
  assert.equal(parseDrilldownRange(new URLSearchParams("dateFrom=2026-09-01")), null);
  assert.equal(parseDrilldownRange(new URLSearchParams("customer=KH01")), null);
  assert.equal(activeDrilldownRange(null, "x"), null);
});
