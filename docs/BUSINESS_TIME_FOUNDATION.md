# Business Time Foundation

**Status:** Foundation built and tested. Not yet adopted anywhere — no existing code was modified to use this module. This document describes what exists today and how future packages should migrate onto it.

**Locked Product Owner decision:** CRM Cẩm Thạch Thu Bình operates only in Vietnam. The official Business Timezone is **Asia/Ho_Chi_Minh (UTC+7)**.

**Module:** `lib/businessTime.ts` — the single source of truth for "what business date/period is this instant in." Zero external dependencies (no date library added); built on native `Intl.DateTimeFormat`.

---

## Business Time vs. Technical Time

Every date/time value in this codebase falls into exactly one of two categories. Confusing them is the root cause of the timezone bugs already found (see the Cost & Profit Security Package's bug investigation and the follow-up Timezone Audit).

### Technical Time

**What:** A record of *when the system did something* — an audit fact, not a business fact.

**Examples in this schema:** `created_at`, `updated_at`, `login_at`, `password_changed_at`, `occurred_at` (audit_logs), `started_at`/`finished_at` (marketing_automation_runs), `event_timestamp` (order_events).

**Rule:** Stays **UTC**, always. Never pass these through `BusinessTime`'s `startOf*`/`today*` family as if they were the business date themselves — only convert them *when a human needs to know what Vietnam calendar day they correspond to* (see `businessDateFromTimestamp` below).

**Why UTC is correct here:** these are machine-to-machine facts (ordering events, computing durations, deduplication). Storing them in UTC is standard practice and nothing about the Business Time decision changes that.

### Business Date

**What:** A calendar date *the business* considers something to have happened on — a fact a Vietnamese staff member or the Product Owner would state as "hôm nay" (today), "tháng này" (this month), etc.

**Examples in this schema:** `orders.order_date`, `payments.payment_date`, `customer_purchases.sale_date`, `customers.next_followup_date`, `product_batches.return_due_date`, Dashboard's "today," Reports' "This Month"/"This Quarter"/"This Year," Sales Ledger's date filters, Commission Date.

**Rule:** Must resolve to the Vietnam calendar day — via `BusinessTime`, once callers migrate to it (see Migration Strategy below).

### The nuance: a Technical Time column used as a Business Date

Some code today slices a UTC `created_at` directly into a calendar date and treats it as a business date (e.g., Commission's "Commission Date" filter, Marketing Automation's `countRunsToday()`). **The column itself stays Technical Time / UTC — nothing about its storage changes.** The *bug* is in the slicing logic, which needs to become `BusinessTime.businessDateFromTimestamp(row.created_at)` instead of `row.created_at.slice(0, 10)`. This is exactly what that helper is for.

---

## Public API

All functions live on the `BusinessTime` object (`import { BusinessTime } from "@/lib/businessTime"`). Every function that operates on "now" accepts an optional `instant: Date` parameter (defaults to `new Date()`) — this exists for testability, not for everyday callers, who should just call it with no arguments.

| Function | Returns | Purpose |
|---|---|---|
| `BusinessTime.now()` | `Date` | The current instant. Identical to `new Date()` — provided for API symmetry only. |
| `BusinessTime.today(instant?)` | `Date` | Alias of `startOfDay()` — "what business day is this." |
| `BusinessTime.todayString(instant?)` | `string` "YYYY-MM-DD" | Today's Vietnam business date, in the exact shape every `date` column in this schema already uses. |
| `BusinessTime.startOfDay(instant?)` | `Date` | 00:00:00 of the Vietnam business day, as a real instant. |
| `BusinessTime.endOfDay(instant?)` | `Date` | 23:59:59.999 of the Vietnam business day — **inclusive** (see caveat below). |
| `BusinessTime.startOfWeek(instant?)` | `Date` | Monday 00:00:00 of the Vietnam business week. |
| `BusinessTime.startOfMonth(instant?)` | `Date` | 1st, 00:00:00, of the Vietnam business month. |
| `BusinessTime.startOfQuarter(instant?)` | `Date` | 1st of Jan/Apr/Jul/Oct, 00:00:00, of the Vietnam business quarter. |
| `BusinessTime.startOfYear(instant?)` | `Date` | Jan 1, 00:00:00, of the Vietnam business year. |
| `BusinessTime.formatDate(value)` | `string` "dd/MM/yyyy" | Vietnamese display format. Accepts a `Date` or an ISO string. |
| `BusinessTime.formatDateTime(value)` | `string` "dd/MM/yyyy HH:mm" | Vietnamese display format with time. |
| `BusinessTime.isSameBusinessDay(a, b)` | `boolean` | Whether two instants fall on the same Vietnam calendar day. |
| `BusinessTime.businessDateFromTimestamp(value)` | `string` "YYYY-MM-DD" | Converts a Technical Time value (typically `created_at`) into the Vietnam business date it happened on. |
| `BusinessTime.businessMonth(instant?)` | `string` "YYYY-MM" | The Vietnam business month. |
| `BusinessTime.businessYear(instant?)` | `number` | The Vietnam business year. |
| `BusinessTime.businessQuarter(instant?)` | `{ year: number, quarter: number }` | The Vietnam business quarter, as data (not a formatted string) so callers compose their own label. |

Also exported: `BUSINESS_TIME_ZONE` (the string constant `"Asia/Ho_Chi_Minh"`), for any caller that needs to pass the zone name to its own `Intl` call.

### Caveat: `endOfDay()` is inclusive, unlike this codebase's existing range convention

`lib/dateFilter.ts`'s `DateRange` (still unmigrated, see below) uses an **exclusive** end bound (`end` = start of the *next* day), because that's what Supabase's `.lt()` wants. `BusinessTime.endOfDay()` instead follows the conventional meaning of "end of day" (23:59:59.999, inclusive) — the same choice every general-purpose date library (date-fns, dayjs, moment) makes, so it isn't surprising to anyone reading the name.

**To build an exclusive range on top of `BusinessTime`,** use the next period's `startOf*`, not `endOfDay()`:

```ts
// "Today", exclusive range for a Supabase .gte()/.lt() query:
const start = BusinessTime.startOfDay();
const end = new Date(BusinessTime.endOfDay().getTime() + 1); // = tomorrow's startOfDay

// "This month", exclusive range:
const monthStart = BusinessTime.startOfMonth();
const nextMonthProbe = new Date(monthStart.getTime());
nextMonthProbe.setUTCMonth(nextMonthProbe.getUTCMonth() + 1); // safe: monthStart is always day 1
const monthEnd = BusinessTime.startOfMonth(nextMonthProbe);
```

---

## Examples

```ts
import { BusinessTime } from "@/lib/businessTime";

// Dashboard "today" label / query bound
const todayStr = BusinessTime.todayString(); // "2026-07-25", correctly Vietnam-anchored

// Converting a Commission's created_at (UTC) into its Commission Date
const commissionDate = BusinessTime.businessDateFromTimestamp(commission.created_at);

// Displaying a payment's timestamp to a Vietnamese staff member
const label = BusinessTime.formatDateTime(payment.created_at); // "25/07/2026 01:01"

// "Is this follow-up due today (Vietnam time), regardless of which runtime asks"
const isToday = BusinessTime.isSameBusinessDay(customer.next_followup_date, BusinessTime.now());
```

## Anti-patterns (what NOT to do, even after this foundation exists)

```ts
// ❌ Still using new Date() directly for a business date - the exact bug class this exists to fix.
const today = new Date().toISOString().slice(0, 10);

// ❌ Slicing a UTC created_at directly as if it were already a Vietnam date.
const commissionDate = commission.created_at.slice(0, 10);

// ❌ Using BusinessTime for a Technical Time column - don't "fix" audit timestamps.
await supabase.from("orders").update({ updated_at: BusinessTime.todayString() }); // wrong - updated_at stays UTC/now()

// ❌ Using endOfDay() where an exclusive range bound was intended - off by one day.
query.lt("sale_date", BusinessTime.endOfDay()); // wrong - endOfDay is inclusive 23:59:59.999, not the exclusive next-day boundary
```

---

## Test Results

`lib/businessTime.test.ts` — 27 tests, all passing (Node's built-in test runner, this project's existing convention, zero new dependencies):

```
node --import tsx --experimental-test-module-mocks --test lib/businessTime.test.ts

ℹ tests 27
ℹ pass 27
ℹ fail 0
```

Coverage: midnight boundary (both directions, to the millisecond), month boundary, quarter boundary, year boundary, week start (Monday, including a UTC-Sunday/Vietnam-Monday crossing), the exact real-world UTC timestamp that caused the Profit Report bug (`2026-07-24T18:01:28Z` → Vietnam `2026-07-25`), `isSameBusinessDay` reproducing the `getFollowUpUrgency()` cross-runtime disagreement scenario, and Vietnamese display formatting.

---

## Migration Strategy for Future Packages

This package built the foundation only — **nothing in Orders, Reports, Dashboard, Marketing, Commission, or the database was changed.** Every bug found in the earlier Timezone Audit is still live. Suggested order for a future package (or packages) to actually adopt `BusinessTime`, unchanged from the audit's own recommendation:

1. **Write path first** — `orders.order_date`/`payments.payment_date`/`customer_purchases.sale_date` DB defaults, and `generateOrderNumber()`'s date prefix (`lib/orders/order.repository.ts`). Stops new data from being written wrong before touching anything else.
2. **Read/filter path** — `lib/dateFilter.ts`'s `getDateRange()` family and the `reports_revenue_periods()` RPC, so "Today"/"This Month"/etc. resolve consistently everywhere they're used.
3. **The cross-runtime function** — `getFollowUpUrgency()` (`lib/customer.constants.ts`), called from both a server route and five client components today.
4. **Remaining slicing bugs** — Commission Date filter, `countRunsToday`/`countFailedRunsToday`, the `.toISOString().slice(0,10)` form defaults (Purchase entry, Payment modal), both Overdue Batch calculations (Reports' server-side one and the two client-side ones in `InventoryBatchTable.tsx`/`BatchTable.tsx`), export filenames.
5. **Marketing's relative-date/birthday SQL functions** — self-contained, can be done independently.
6. **Historical backfill decision** — only after 1–5 are live; needs explicit Product Owner sign-off on whether past data gets reclassified (see the audit's §7).

Each future package should replace the specific `new Date()`/`CURRENT_DATE`/`.toISOString().slice(0,10)`/`now()` call it targets with the matching `BusinessTime` function, one file at a time — not a bulk find-and-replace, since a few of the audit's findings (e.g. `recentlyContacted`'s 7-day window) are duration-based and don't actually need to change.
