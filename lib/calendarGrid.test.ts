import test from "node:test";
import assert from "node:assert/strict";
import { WEEKDAY_LABELS, clampIso, isWithin, monthGrid, monthLabel, moveByKey, parseIso, shiftDays, shiftMonths } from "./calendarGrid";

// Phase 1.6B.1 - the DatePicker's calendar layout and keyboard movement. Every expectation is written out by hand from
// the calendar (e.g. 1 Sep 2026 is a Tuesday, 1 Feb 2026 a Sunday, 1 Jun 2026 a Monday, 1 Feb 2028 a Tuesday).

test("monthGrid always yields 42 Monday-first cells and marks the days of the month", () => {
  for (const [y, m] of [[2026, 9], [2028, 2], [2027, 2], [2026, 12], [2026, 1], [2100, 2]] as const) {
    const g = monthGrid(y, m);
    assert.equal(g.length, 42, `${y}-${m}`);
    const inMonth = g.filter((c) => c.inMonth);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    assert.equal(inMonth.length, daysInMonth, `${y}-${m} has ${daysInMonth} days`);
    assert.equal(inMonth[0].day, 1);
    assert.equal(new Set(g.map((c) => c.iso)).size, 42, "no duplicate day");
  }
});

test("month that starts on a Tuesday (Sep 2026): the grid opens with Mon 31 Aug", () => {
  const g = monthGrid(2026, 9);
  assert.equal(g[0].iso, "2026-08-31");
  assert.equal(g[0].inMonth, false);
  assert.equal(g[1].iso, "2026-09-01");
  assert.equal(g[1].inMonth, true);
  assert.equal(g[41].iso, "2026-10-11");
});

test("month that starts on a Monday (Jun 2026): no leading padding", () => {
  const g = monthGrid(2026, 6);
  assert.equal(g[0].iso, "2026-06-01");
  assert.equal(g[0].inMonth, true);
});

test("month that starts on a Sunday (Feb 2026): six leading days from January", () => {
  const g = monthGrid(2026, 2);
  assert.equal(g[0].iso, "2026-01-26");
  assert.equal(g[6].iso, "2026-02-01");
  assert.equal(g[6].inMonth, true);
});

test("leap February 2028 has 29 days and starts under Mon 31 Jan", () => {
  const g = monthGrid(2028, 2);
  assert.equal(g[0].iso, "2028-01-31");
  assert.ok(g.some((c) => c.iso === "2028-02-29" && c.inMonth));
  assert.equal(monthGrid(2027, 2).filter((c) => c.inMonth).length, 28);
  assert.equal(monthGrid(2100, 2).filter((c) => c.inMonth).length, 28, "2100 is not a leap year");
});

test("year boundary: December 2026 grid runs into January 2027", () => {
  const g = monthGrid(2026, 12);
  assert.equal(g[0].iso, "2026-11-30");
  assert.ok(g.some((c) => c.iso === "2027-01-01" && !c.inMonth));
});

test("parseIso accepts only real calendar dates", () => {
  assert.deepEqual(parseIso("2028-02-29"), { y: 2028, m: 2, d: 29 });
  assert.equal(parseIso("2027-02-29"), null);
  assert.equal(parseIso("2100-02-29"), null);
  assert.equal(parseIso("2026-02-30"), null);
  assert.equal(parseIso("05/08/2026"), null);
  assert.equal(parseIso(""), null);
});

test("shiftDays crosses month, leap-day and year boundaries", () => {
  assert.equal(shiftDays("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDays("2028-02-29", 1), "2028-03-01");
  assert.equal(shiftDays("2027-02-28", 1), "2027-03-01");
  assert.equal(shiftDays("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDays("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDays("garbage", 3), "garbage");
});

test("shiftMonths keeps the day, clamping to the last day of a shorter month", () => {
  assert.equal(shiftMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(shiftMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(shiftMonths("2026-01-15", -1), "2025-12-15");
  assert.equal(shiftMonths("2026-12-15", 1), "2027-01-15");
});

test("keyboard: arrows move by day / week, Home/End by week boundary, PageUp/PageDown by month", () => {
  const wed = "2026-09-02"; // a Wednesday
  assert.equal(moveByKey(wed, "ArrowLeft"), "2026-09-01");
  assert.equal(moveByKey(wed, "ArrowRight"), "2026-09-03");
  assert.equal(moveByKey(wed, "ArrowUp"), "2026-08-26");
  assert.equal(moveByKey(wed, "ArrowDown"), "2026-09-09");
  assert.equal(moveByKey(wed, "Home"), "2026-08-31", "Monday of that week");
  assert.equal(moveByKey(wed, "End"), "2026-09-06", "Sunday of that week");
  assert.equal(moveByKey("2026-01-31", "PageDown"), "2026-02-28");
  assert.equal(moveByKey("2026-03-15", "PageUp"), "2026-02-15");
  assert.equal(moveByKey(wed, "x"), null);
  assert.equal(moveByKey("garbage", "ArrowLeft"), null);
  // Monday stays Monday on Home, Sunday stays Sunday on End
  assert.equal(moveByKey("2026-08-31", "Home"), "2026-08-31");
  assert.equal(moveByKey("2026-09-06", "End"), "2026-09-06");
});

test("min / max: inclusive bounds and clamping", () => {
  assert.equal(isWithin("2026-09-10", "2026-09-01", "2026-09-30"), true);
  assert.equal(isWithin("2026-09-01", "2026-09-01", "2026-09-30"), true);
  assert.equal(isWithin("2026-09-30", "2026-09-01", "2026-09-30"), true);
  assert.equal(isWithin("2026-08-31", "2026-09-01", "2026-09-30"), false);
  assert.equal(isWithin("2026-10-01", "2026-09-01", "2026-09-30"), false);
  assert.equal(isWithin("2026-10-01"), true, "no bounds = always allowed");
  assert.equal(clampIso("2026-08-01", "2026-09-01", "2026-09-30"), "2026-09-01");
  assert.equal(clampIso("2026-12-01", "2026-09-01", "2026-09-30"), "2026-09-30");
  assert.equal(clampIso("2026-09-15", "2026-09-01", "2026-09-30"), "2026-09-15");
});

test("labels are Vietnamese and Monday-first", () => {
  assert.equal(monthLabel(2026, 9), "Tháng 9/2026");
  assert.deepEqual([...WEEKDAY_LABELS], ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
});
