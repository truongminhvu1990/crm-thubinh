// Business Time Foundation.
//
// Product Owner decision (LOCKED): CRM Cẩm Thạch Thu Bình operates only in
// Vietnam. The official Business Timezone is Asia/Ho_Chi_Minh (UTC+7).
//
// This module is the ONLY source of truth for "what business date/period is
// this instant in". It does not replace or call into any existing date
// logic (lib/dateFilter.ts, order.repository.ts's generateOrderNumber,
// getFollowUpUrgency, the reports_revenue_periods() RPC, etc.) - those all
// still compute dates their own (currently inconsistent, UTC-anchored) way.
// Migrating them onto BusinessTime is future work, package by package, not
// part of this one. See docs/BUSINESS_TIME_FOUNDATION.md.
//
// Two categories of "time" exist in this codebase, and they must not be
// confused:
//   - Technical Time: created_at/updated_at/login_at/audit logs - "when did
//     this row change", a system fact. Stays UTC (timestamptz), unaffected
//     by this module.
//   - Business Time: Order Date, Sale Date, Payment Date, Follow-up Date,
//     "today" on Dashboard/Reports, Commission Date, and any month/quarter/
//     year bucketing shown to a human. Must resolve to the Vietnam calendar
//     day the business considers it to have happened on - what this module
//     provides.
//
// Implementation note: Vietnam has observed a fixed UTC+7 offset with no
// daylight-saving transitions since 1975, so a constant 7-hour offset is
// exact for both directions of conversion - no historical-offset table is
// needed the way a general-purpose timezone library would require for
// DST-observing zones. `Intl.DateTimeFormat` with the IANA zone name is
// still used (not a hardcoded "+7") for the instant -> Vietnam-calendar-date
// direction, so the zone is named explicitly (matches the locked Product
// Owner decision) rather than encoded as an unexplained magic number.

const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";
const BUSINESS_UTC_OFFSET_HOURS = 7;
const MS_PER_DAY = 86_400_000;

interface BusinessDateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toInstant(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

// Reused across calls - Intl.DateTimeFormat instances are stateless/
// reusable, and constructing one per call would be wasteful on hot paths
// (e.g. formatting every row of a report table).
const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** The one place an instant (any timezone, any source - a UTC `created_at`,
 * a client's `new Date()`, whatever) gets turned into "what Vietnam
 * calendar date/time is this". Everything else in this file is built on
 * top of this single conversion. */
function getBusinessParts(instant: Date): BusinessDateParts {
  const parts = partsFormatter.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Some ICU implementations report midnight as "24" under hour12:false
    // instead of "00" - normalize it.
    hour: map.hour === "24" ? 0 : Number(map.hour),
    minute: Number(map.minute),
  };
}

/** The one place a Vietnam calendar date gets turned back into a real
 * instant (a `Date`, i.e. a UTC-epoch millisecond value) - the exact UTC
 * instant of 00:00:00 in Asia/Ho_Chi_Minh on that date. `Date.UTC` handles
 * the resulting negative-hour rollover to the previous UTC day correctly on
 * its own. */
function businessMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -BUSINESS_UTC_OFFSET_HOURS, 0, 0, 0));
}

function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * MS_PER_DAY);
}

/** The start (00:00:00) of the Vietnam business day `instant` falls in, as
 * a real instant. Defaults to now. */
function startOfDay(instant: Date = new Date()): Date {
  const { year, month, day } = getBusinessParts(instant);
  return businessMidnightUtc(year, month, day);
}

/** Alias of `startOfDay()` - "what business day is this", read where the
 * caller wants a day identity rather than a range boundary. */
function today(instant: Date = new Date()): Date {
  return startOfDay(instant);
}

/** Today's Vietnam business date as "YYYY-MM-DD" - the exact string shape
 * every `date` column in this schema (order_date, sale_date, payment_date,
 * next_followup_date, return_due_date) already uses. */
function todayString(instant: Date = new Date()): string {
  const { year, month, day } = getBusinessParts(instant);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The last instant (23:59:59.999) of the Vietnam business day `instant`
 * falls in - inclusive, matching every general-purpose date library's
 * convention for "end of day". NOT the same as this codebase's existing
 * `DateRange.end` (lib/dateFilter.ts), which is an *exclusive* next-day
 * boundary for `.lt()` queries - see docs/BUSINESS_TIME_FOUNDATION.md for
 * how to build an exclusive range on top of this. */
function endOfDay(instant: Date = new Date()): Date {
  return new Date(addDays(startOfDay(instant), 1).getTime() - 1);
}

/** Start (Monday 00:00:00) of the Vietnam business week `instant` falls in.
 * Monday-start matches lib/dateFilter.ts's existing "This Week" convention. */
function startOfWeek(instant: Date = new Date()): Date {
  const { year, month, day } = getBusinessParts(instant);
  // Weekday-of-a-calendar-date is timezone-independent once the correct
  // Vietnam y/m/d is known - using the local Date constructor here only to
  // read .getDay(), never to represent an instant.
  const weekdayIndex = new Date(year, month - 1, day).getDay(); // 0=Sun..6=Sat
  const diffToMonday = weekdayIndex === 0 ? 6 : weekdayIndex - 1;
  return addDays(businessMidnightUtc(year, month, day), -diffToMonday);
}

/** Start (1st, 00:00:00) of the Vietnam business month `instant` falls in. */
function startOfMonth(instant: Date = new Date()): Date {
  const { year, month } = getBusinessParts(instant);
  return businessMidnightUtc(year, month, 1);
}

/** Start of the Vietnam business quarter `instant` falls in (Q1=Jan,
 * Q2=Apr, Q3=Jul, Q4=Oct). */
function startOfQuarter(instant: Date = new Date()): Date {
  const { year, month } = getBusinessParts(instant);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return businessMidnightUtc(year, quarterStartMonth, 1);
}

/** Start (Jan 1, 00:00:00) of the Vietnam business year `instant` falls in. */
function startOfYear(instant: Date = new Date()): Date {
  const { year } = getBusinessParts(instant);
  return businessMidnightUtc(year, 1, 1);
}

/** Vietnamese dd/MM/yyyy - accepts a Date or an ISO string (e.g. a raw
 * `created_at` straight from Supabase). */
function formatDate(value: Date | string): string {
  const { year, month, day } = getBusinessParts(toInstant(value));
  return `${pad(day)}/${pad(month)}/${year}`;
}

/** Vietnamese dd/MM/yyyy HH:mm. */
function formatDateTime(value: Date | string): string {
  const { year, month, day, hour, minute } = getBusinessParts(toInstant(value));
  return `${pad(day)}/${pad(month)}/${year} ${pad(hour)}:${pad(minute)}`;
}

/** Converts any timestamp (typically a UTC `created_at`/`updated_at`) into
 * the Vietnam business date it actually happened on, as "YYYY-MM-DD". This
 * is the specific conversion the Timezone Foundation investigation needed
 * and didn't have: "this Commission's created_at is
 * 2026-07-24T18:01:28Z - what Commission Date is that in Vietnam?" ->
 * "2026-07-25". */
function businessDateFromTimestamp(value: Date | string): string {
  return todayString(toInstant(value));
}

/** Whether two instants (Date or ISO string, mix freely - e.g. a UTC
 * `created_at` vs. a `new Date()`) fall on the same Vietnam calendar day. */
function isSameBusinessDay(a: Date | string, b: Date | string): boolean {
  return businessDateFromTimestamp(a) === businessDateFromTimestamp(b);
}

/** "YYYY-MM" for the Vietnam business month `instant` falls in. */
function businessMonth(instant: Date = new Date()): string {
  const { year, month } = getBusinessParts(instant);
  return `${year}-${pad(month)}`;
}

/** The Vietnam business year `instant` falls in. */
function businessYear(instant: Date = new Date()): number {
  return getBusinessParts(instant).year;
}

/** The Vietnam business quarter `instant` falls in, as `{ year, quarter }`
 * (quarter is 1-4) rather than a formatted string, so callers can compose
 * their own label (e.g. "Quý 3/2026") without parsing one back apart. */
function businessQuarter(instant: Date = new Date()): { year: number; quarter: number } {
  const { year, month } = getBusinessParts(instant);
  return { year, quarter: Math.floor((month - 1) / 3) + 1 };
}

/** The current instant. Identical to `new Date()` - provided for
 * discoverability/symmetry with the rest of this API; every other function
 * here is what actually anchors to Vietnam time. */
function now(): Date {
  return new Date();
}

export const BusinessTime = {
  now,
  today,
  todayString,
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  formatDate,
  formatDateTime,
  isSameBusinessDay,
  businessDateFromTimestamp,
  businessMonth,
  businessYear,
  businessQuarter,
};

export { BUSINESS_TIME_ZONE };
