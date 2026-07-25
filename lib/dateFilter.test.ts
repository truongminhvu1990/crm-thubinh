import test from "node:test";
import assert from "node:assert/strict";
import { getDateRange, getPreviousEquivalentRange, getDateFilterLabel } from "./dateFilter";

/**
 * Business Time Migration, Wave 2 (READ PATH) - boundary verification for
 * lib/dateFilter.ts, the one shared implementation Dashboard/Reports/Sales
 * Ledger all consume via useGlobalDateFilter(). Uses node:test's built-in
 * Date mock (`mock.timers`, no new dependency) to freeze "now" at each
 * boundary instant, same technique as lib/orders/order.businessTime.test.ts.
 *
 * Every instant below is real UTC (this environment's actual clock/DB
 * timezone, confirmed via live Development checks in earlier packages),
 * paired with the Vietnam calendar date it corresponds to.
 */

interface Boundary {
  name: string;
  utcMs: number;
  vnDate: string; // YYYY-MM-DD
  vnMonthStart: string;
  vnMonthEnd: string; // exclusive
  vnQuarterStart: string;
  vnQuarterEnd: string; // exclusive
  vnYearStart: string;
  vnYearEnd: string; // exclusive
  vnWeekStart: string; // Monday
}

const BOUNDARIES: Boundary[] = [
  {
    // 2026-07-24 23:59:00 ICT = 2026-07-24 16:59:00 UTC.
    name: "23:59 Vietnam",
    utcMs: Date.parse("2026-07-24T16:59:00.000Z"),
    vnDate: "2026-07-24",
    vnMonthStart: "2026-07-01",
    vnMonthEnd: "2026-08-01",
    vnQuarterStart: "2026-07-01",
    vnQuarterEnd: "2026-10-01",
    vnYearStart: "2026-01-01",
    vnYearEnd: "2027-01-01",
    vnWeekStart: "2026-07-20", // Monday
  },
  {
    // 2026-07-25 00:01:00 ICT = 2026-07-24 17:01:00 UTC - the exact
    // "still July 24 in UTC, already July 25 in Vietnam" bug scenario.
    name: "00:01 Vietnam",
    utcMs: Date.parse("2026-07-24T17:01:00.000Z"),
    vnDate: "2026-07-25",
    vnMonthStart: "2026-07-01",
    vnMonthEnd: "2026-08-01",
    vnQuarterStart: "2026-07-01",
    vnQuarterEnd: "2026-10-01",
    vnYearStart: "2026-01-01",
    vnYearEnd: "2027-01-01",
    vnWeekStart: "2026-07-20", // Monday
  },
  {
    // 2026-08-01 00:01:00 ICT = 2026-07-31 17:01:00 UTC - month boundary.
    name: "month boundary (July -> August)",
    utcMs: Date.parse("2026-07-31T17:01:00.000Z"),
    vnDate: "2026-08-01",
    vnMonthStart: "2026-08-01",
    vnMonthEnd: "2026-09-01",
    vnQuarterStart: "2026-07-01",
    vnQuarterEnd: "2026-10-01",
    vnYearStart: "2026-01-01",
    vnYearEnd: "2027-01-01",
    vnWeekStart: "2026-07-27", // Monday
  },
  {
    // 2026-07-01 00:01:00 ICT = 2026-06-30 17:01:00 UTC - quarter boundary.
    name: "quarter boundary (Q2 -> Q3)",
    utcMs: Date.parse("2026-06-30T17:01:00.000Z"),
    vnDate: "2026-07-01",
    vnMonthStart: "2026-07-01",
    vnMonthEnd: "2026-08-01",
    vnQuarterStart: "2026-07-01",
    vnQuarterEnd: "2026-10-01",
    vnYearStart: "2026-01-01",
    vnYearEnd: "2027-01-01",
    vnWeekStart: "2026-06-29", // Monday
  },
  {
    // 2027-01-01 00:01:00 ICT = 2026-12-31 17:01:00 UTC - year boundary.
    name: "year boundary (2026 -> 2027)",
    utcMs: Date.parse("2026-12-31T17:01:00.000Z"),
    vnDate: "2027-01-01",
    vnMonthStart: "2027-01-01",
    vnMonthEnd: "2027-02-01",
    vnQuarterStart: "2027-01-01",
    vnQuarterEnd: "2027-04-01",
    vnYearStart: "2027-01-01",
    vnYearEnd: "2028-01-01",
    vnWeekStart: "2026-12-28", // Monday
  },
];

for (const b of BOUNDARIES) {
  test(`getDateRange("today") at ${b.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: b.utcMs });
    const range = getDateRange("today");
    t.mock.timers.reset();
    assert.deepEqual(range, { start: b.vnDate, end: addOneDay(b.vnDate) });
  });

  test(`getDateRange("this_week") at ${b.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: b.utcMs });
    const range = getDateRange("this_week");
    t.mock.timers.reset();
    assert.equal(range?.start, b.vnWeekStart);
    assert.equal(range?.end, addDays(b.vnWeekStart, 7));
  });

  test(`getDateRange("this_month") at ${b.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: b.utcMs });
    const range = getDateRange("this_month");
    t.mock.timers.reset();
    assert.deepEqual(range, { start: b.vnMonthStart, end: b.vnMonthEnd });
  });

  test(`getDateRange("this_quarter") at ${b.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: b.utcMs });
    const range = getDateRange("this_quarter");
    t.mock.timers.reset();
    assert.deepEqual(range, { start: b.vnQuarterStart, end: b.vnQuarterEnd });
  });

  test(`getDateRange("this_year") at ${b.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: b.utcMs });
    const range = getDateRange("this_year");
    t.mock.timers.reset();
    assert.deepEqual(range, { start: b.vnYearStart, end: b.vnYearEnd });
  });

  test(`"Yesterday" (getPreviousEquivalentRange of "today") at ${b.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: b.utcMs });
    const today = getDateRange("today");
    const yesterday = getPreviousEquivalentRange("today", today);
    t.mock.timers.reset();
    assert.deepEqual(yesterday, { start: subtractOneDay(b.vnDate), end: b.vnDate });
  });

  test(`getDateFilterLabel at ${b.name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: b.utcMs });
    const [year, month] = b.vnMonthStart.split("-");
    const monthLabel = getDateFilterLabel("this_month");
    const yearLabel = getDateFilterLabel("this_year");
    t.mock.timers.reset();
    assert.equal(monthLabel, `Tháng ${Number(month)}/${year}`);
    assert.equal(yearLabel, `${b.vnYearStart.split("-")[0]}`);
  });
}

test("Revenue/Cost/Profit/Sales Ledger/Dashboard all agree on the same business date: getDateRange is deterministic for repeated calls at the same instant", (t) => {
  // Dashboard, Reports (legacy Doanh thu section + ProfitSection), and Sales
  // Ledger each call getDateRange("today") independently (via their own
  // fetch effect, through the one shared useGlobalDateFilter() context) -
  // "they agree" is only true if the function returns byte-identical output
  // every time it's called within the same render/instant. This is the
  // property that guarantees Revenue Report and Profit Report return the
  // same business-day rows, and that Dashboard/Sales Ledger's own "Today"
  // matches Reports' - not a separate mechanism, the same one, called
  // multiple times.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-07-24T17:01:00.000Z") }); // 00:01 ICT
  const dashboardRange = getDateRange("today");
  const reportsRevenueRange = getDateRange("today");
  const reportsProfitRange = getDateRange("today");
  const salesLedgerRange = getDateRange("today");
  t.mock.timers.reset();

  assert.deepEqual(dashboardRange, { start: "2026-07-25", end: "2026-07-26" });
  assert.deepEqual(dashboardRange, reportsRevenueRange);
  assert.deepEqual(reportsRevenueRange, reportsProfitRange);
  assert.deepEqual(reportsProfitRange, salesLedgerRange);
});

test("all_time still returns null (unaffected by the migration)", () => {
  assert.equal(getDateRange("all_time"), null);
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function addOneDay(dateStr: string): string {
  return addDays(dateStr, 1);
}

function subtractOneDay(dateStr: string): string {
  return addDays(dateStr, -1);
}
