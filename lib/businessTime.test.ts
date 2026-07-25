import test from "node:test";
import assert from "node:assert/strict";
import { BusinessTime, BUSINESS_TIME_ZONE } from "./businessTime";

// Business Time Foundation - unit tests. No mocking needed: businessTime.ts
// has zero external imports (no Supabase, no other lib module), so every
// test drives it directly with fixed instants.
//
// Vietnam is UTC+7 with no DST, so the boundary instant between "still
// yesterday in Vietnam" and "already today in Vietnam" is always exactly
// 17:00 UTC. Every boundary test below is built around that fact.

test("BUSINESS_TIME_ZONE is the locked Product Owner value", () => {
  assert.equal(BUSINESS_TIME_ZONE, "Asia/Ho_Chi_Minh");
});

test("todayString: UTC timestamp conversion - the exact real-world bug case", () => {
  // Confirmed live in Development: a purchase created at 2026-07-24
  // 18:01:28 UTC (Postgres timestamptz, correctly UTC) is already
  // 2026-07-25 01:01:28 in Vietnam - the Profit Report bug this whole
  // package exists to eventually fix.
  assert.equal(BusinessTime.todayString(new Date("2026-07-24T18:01:28.704Z")), "2026-07-25");
  assert.equal(BusinessTime.businessDateFromTimestamp("2026-07-24T18:01:28.704Z"), "2026-07-25");
});

test("todayString: an afternoon UTC timestamp stays on the same Vietnam day", () => {
  // 2026-07-24 10:00 UTC = 2026-07-24 17:00 ICT - same calendar day both sides.
  assert.equal(BusinessTime.todayString(new Date("2026-07-24T10:00:00.000Z")), "2026-07-24");
});

test("midnight boundary: exactly 17:00:00.000 UTC is the first instant of the next Vietnam day", () => {
  assert.equal(BusinessTime.todayString(new Date("2026-07-24T17:00:00.000Z")), "2026-07-25");
});

test("midnight boundary: one millisecond earlier is still the previous Vietnam day", () => {
  assert.equal(BusinessTime.todayString(new Date("2026-07-24T16:59:59.999Z")), "2026-07-24");
});

test("startOfDay: returns the exact UTC instant of Vietnam midnight", () => {
  const start = BusinessTime.startOfDay(new Date("2026-07-24T18:01:28.704Z"));
  assert.equal(start.toISOString(), "2026-07-24T17:00:00.000Z");
});

test("today: is an alias of startOfDay", () => {
  const instant = new Date("2026-03-15T09:30:00.000Z");
  assert.equal(BusinessTime.today(instant).getTime(), BusinessTime.startOfDay(instant).getTime());
});

test("endOfDay: is the last millisecond of the Vietnam business day (inclusive)", () => {
  const end = BusinessTime.endOfDay(new Date("2026-07-24T18:01:28.704Z")); // Vietnam 2026-07-25
  assert.equal(end.toISOString(), "2026-07-25T16:59:59.999Z");
});

test("endOfDay + 1ms equals the next day's startOfDay (exclusive-range composition)", () => {
  const instant = new Date("2026-07-24T18:01:28.704Z");
  const end = BusinessTime.endOfDay(instant);
  const nextDayStart = BusinessTime.startOfDay(new Date(end.getTime() + 1));
  assert.equal(new Date(end.getTime() + 1).getTime(), nextDayStart.getTime());
});

test("month boundary: 23:59:59.999 ICT on the last day of July is still July in Vietnam", () => {
  // 2026-07-31 16:59:59.999 UTC = 2026-07-31 23:59:59.999 ICT.
  assert.equal(BusinessTime.todayString(new Date("2026-07-31T16:59:59.999Z")), "2026-07-31");
  assert.equal(BusinessTime.businessMonth(new Date("2026-07-31T16:59:59.999Z")), "2026-07");
});

test("month boundary: one millisecond later is already August 1 in Vietnam", () => {
  // 2026-07-31 17:00:00.000 UTC = 2026-08-01 00:00:00.000 ICT.
  assert.equal(BusinessTime.todayString(new Date("2026-07-31T17:00:00.000Z")), "2026-08-01");
  assert.equal(BusinessTime.businessMonth(new Date("2026-07-31T17:00:00.000Z")), "2026-08");
});

test("startOfMonth: resolves to the 1st at Vietnam midnight, in UTC-instant terms", () => {
  const start = BusinessTime.startOfMonth(new Date("2026-07-24T18:01:28.704Z")); // Vietnam July 25
  assert.equal(start.toISOString(), "2026-06-30T17:00:00.000Z"); // Vietnam July 1 00:00
});

test("startOfMonth: a UTC-late-July instant that is already Vietnam-August starts at August 1", () => {
  const start = BusinessTime.startOfMonth(new Date("2026-07-31T17:00:00.000Z")); // Vietnam Aug 1
  assert.equal(start.toISOString(), "2026-07-31T17:00:00.000Z"); // Vietnam Aug 1 00:00
});

test("quarter boundary: instant just before Q3 start is still Q2", () => {
  // 2026-06-30 16:59:59.999 UTC = 2026-06-30 23:59:59.999 ICT (still Q2).
  const q = BusinessTime.businessQuarter(new Date("2026-06-30T16:59:59.999Z"));
  assert.deepEqual(q, { year: 2026, quarter: 2 });
});

test("quarter boundary: one millisecond later is already Q3 in Vietnam", () => {
  // 2026-06-30 17:00:00.000 UTC = 2026-07-01 00:00:00.000 ICT (Q3 starts).
  const q = BusinessTime.businessQuarter(new Date("2026-06-30T17:00:00.000Z"));
  assert.deepEqual(q, { year: 2026, quarter: 3 });
});

test("startOfQuarter: resolves to the first day of the quarter at Vietnam midnight", () => {
  const start = BusinessTime.startOfQuarter(new Date("2026-08-15T12:00:00.000Z")); // Q3
  assert.equal(start.toISOString(), "2026-06-30T17:00:00.000Z"); // Vietnam July 1 00:00
});

test("year boundary: instant just before Vietnam New Year is still the old year", () => {
  // 2026-12-31 16:59:59.999 UTC = 2026-12-31 23:59:59.999 ICT.
  assert.equal(BusinessTime.businessYear(new Date("2026-12-31T16:59:59.999Z")), 2026);
});

test("year boundary: one millisecond later is already the new year in Vietnam", () => {
  // 2026-12-31 17:00:00.000 UTC = 2027-01-01 00:00:00.000 ICT.
  assert.equal(BusinessTime.businessYear(new Date("2026-12-31T17:00:00.000Z")), 2027);
});

test("startOfYear: resolves to Jan 1 at Vietnam midnight", () => {
  const start = BusinessTime.startOfYear(new Date("2026-07-24T18:01:28.704Z"));
  assert.equal(start.toISOString(), "2025-12-31T17:00:00.000Z"); // Vietnam 2026-01-01 00:00
});

test("startOfWeek: Monday-start, matching lib/dateFilter.ts's existing convention", () => {
  // 2026-07-24 18:01:28 UTC = Friday 2026-07-25 01:01:28 ICT.
  // Monday of that Vietnam week is 2026-07-20.
  const start = BusinessTime.startOfWeek(new Date("2026-07-24T18:01:28.704Z"));
  assert.equal(BusinessTime.todayString(start), "2026-07-20");
});

test("startOfWeek: a UTC-Sunday-night instant that is already Vietnam-Monday starts its own week", () => {
  // 2026-07-19 is a Sunday. 17:00 UTC that day = 2026-07-20 00:00 ICT (Monday).
  const start = BusinessTime.startOfWeek(new Date("2026-07-19T17:00:00.000Z"));
  assert.equal(BusinessTime.todayString(start), "2026-07-20");
});

test("isSameBusinessDay: a UTC created_at and a same-Vietnam-morning instant agree", () => {
  // The exact cross-runtime disagreement getFollowUpUrgency() could
  // otherwise produce: a server-side UTC created_at at 18:01 UTC on the
  // 24th and a browser instant a few minutes later, both actually
  // "2026-07-25" in Vietnam.
  const serverCreatedAt = "2026-07-24T18:01:28.704Z";
  const clientNow = new Date("2026-07-24T18:10:00.000Z");
  assert.equal(BusinessTime.isSameBusinessDay(serverCreatedAt, clientNow), true);
});

test("isSameBusinessDay: false across a real Vietnam day boundary", () => {
  assert.equal(
    BusinessTime.isSameBusinessDay("2026-07-24T16:59:59.999Z", "2026-07-24T17:00:00.000Z"),
    false
  );
});

test("formatDate: Vietnamese dd/MM/yyyy, Vietnam-anchored", () => {
  // 2026-07-24 18:01:28 UTC is Vietnam 2026-07-25.
  assert.equal(BusinessTime.formatDate("2026-07-24T18:01:28.704Z"), "25/07/2026");
});

test("formatDateTime: Vietnamese dd/MM/yyyy HH:mm, Vietnam-anchored", () => {
  assert.equal(BusinessTime.formatDateTime("2026-07-24T18:01:28.704Z"), "25/07/2026 01:01");
});

test("businessMonth/businessYear/businessQuarter accept a Date argument directly", () => {
  const instant = new Date("2026-01-01T02:00:00.000Z"); // 2026-01-01 09:00 ICT
  assert.equal(BusinessTime.businessMonth(instant), "2026-01");
  assert.equal(BusinessTime.businessYear(instant), 2026);
  assert.deepEqual(BusinessTime.businessQuarter(instant), { year: 2026, quarter: 1 });
});

test("now: returns the current instant (sanity check, not a fixed-time assertion)", () => {
  const before = Date.now();
  const result = BusinessTime.now().getTime();
  const after = Date.now();
  assert.ok(result >= before && result <= after);
});
