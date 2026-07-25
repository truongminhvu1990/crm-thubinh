# QA Framework (Playwright)

This is the automated QA framework for the CRM: structure, helpers, page
objects, utilities, and (from QA Wave 1) the first production-ready
regression pack for **Login**, **Customers**, and **Products**. Every other
module folder is still empty, waiting for its own Wave.

## Setup

1. Install browsers once per machine:
   ```
   npx playwright install
   ```
2. Copy the env template and fill in real Dev/staging credentials:
   ```
   cp .env.test.example .env.test
   ```
   `.env.test` needs a `QA_BASE_URL` and one email/password pair per role
   (`QA_OWNER_EMAIL`/`QA_OWNER_PASSWORD`, `QA_MANAGER_EMAIL`/…, etc.).
   These must be real accounts seeded in the **Dev** Supabase project —
   never point this at production.
3. Make sure `.env.local` already has `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` pointed at the same **Dev** project (see
   `.env.example`). `playwright.config.ts` loads `.env.local` as a fallback
   so the Wave 1 database-verification helpers (`tests/shared/utils/db.ts`)
   can read/write directly without a second copy of the key.
4. Make sure the app is running at `QA_BASE_URL` (e.g. `npm run dev` in
   another terminal). There's no `webServer` auto-start configured yet —
   see the commented-out block in `playwright.config.ts`.

## How to run

```
npx playwright test                     # run everything, headless
npx playwright test tests/login         # run one folder
npx playwright test -g "Owner can log"  # run by test title
npx playwright test --headed            # watch the browser
npx playwright test --ui                # interactive UI mode (best for authoring)
npx playwright test --debug             # step through with the Playwright Inspector
```

## How to generate reports

An HTML report is written on every run to `artifacts/report/`. Open the
most recent one with:

```
npx playwright show-report artifacts/report
```

The `list` reporter also prints pass/fail directly to the terminal.

## How to debug a failing test

- `npx playwright test --debug` — pauses on the first line and lets you
  step through with the Playwright Inspector.
- `npx playwright test --ui` — re-run individual steps, inspect the DOM
  snapshot at each step, and watch network/console activity live.
- Traces: captured `retain-on-failure` — every failed test gets one, not
  just retries. Open it with:
  ```
  npx playwright show-trace artifacts/test-results/<test-folder>/trace.zip
  ```
- Failure screenshots and videos: Playwright automatically saves these
  next to the trace, under `artifacts/test-results/<test-folder>/`, because
  `screenshot: "only-on-failure"` and `video: "retain-on-failure"` are set
  in `playwright.config.ts`.

## How screenshots are stored

There are two distinct sources of screenshots/videos/traces — don't
confuse them:

| Location | What it is | When it's written |
|---|---|---|
| `artifacts/test-results/` | Playwright's automatic failure capture (screenshot + video + trace bundled per test) | Only on failure |
| `artifacts/screenshots/` | Deliberate, named captures via `takeScreenshot(page, name)` | Whenever a test calls it, pass or fail |
| `artifacts/videos/` | Reserved for manually exported/curated videos (e.g. copied out of a CI run for a bug report) | Manual |
| `artifacts/traces/` | Reserved for manually saved traces (`context.tracing.stop({ path })`) for a specific step, independent of the failure-triggered trace above | Manual |
| `artifacts/report/` | The HTML report (`npx playwright show-report artifacts/report`) | Every run |

Everything under `artifacts/` except the four `.gitkeep` files is
gitignored — these are run outputs, not source.

## Project structure

```
tests/
  login/        # auth flows
  customers/
  products/
  orders/
  reports/
  dashboard/
  commission/
  marketing/
  staff/
  permission/
  shared/
    pages/       # Page Object Model — one class per screen
    utils/        # helpers: auth, waiting, screenshots, diagnostics, toasts, assertions
```

Each empty module folder has a `.gitkeep` placeholder — business test specs
land there in a future package, per module.

### Page objects (`tests/shared/pages`)

`LoginPage`, `DashboardPage`, `CustomerPage`, `ProductPage`, `OrderPage`,
`ReportPage`, `SalesLedgerPage`, `StaffPage`, `PermissionPage` — all extend
`BasePage` (`goto`, `heading`, `expectLoaded`). Import from the barrel:

```ts
import { DashboardPage, OrderPage } from "../shared/pages";
```

### Auth helpers (`tests/shared/utils/auth.ts`)

```ts
import { loginAsOwner, loginAsManager, loginAsSales, loginAsMarketing, loginAsViewer, logout, resetSession } from "../shared/utils";

await loginAsOwner(page);   // logs in via the UI, asserts redirect to /dashboard
await logout(page);         // clicks the header logout button, asserts redirect to /login
await resetSession(page);   // clears cookies + storage without navigating
```

Each `loginAsX` reads its credentials from `.env.test` and throws a clear
error if they're missing — it will never silently proceed unauthenticated.

### Shared utilities (`tests/shared/utils`)

- `waitForLoading(page)` — waits out the app's `.animate-spin` loading state.
- `takeScreenshot(page, name)` — saves to `artifacts/screenshots/`.
- `watchConsoleErrors(page)` / `expectNoConsoleErrors(errors)` — attach the
  watcher right after `page` is created (before navigating), assert later.
- `watchNetworkErrors(page)` / `expectNoNetwork500(failures)` — same pattern
  for 5xx HTTP responses.
- `expectSuccessToast(page, text?)` / `expectErrorToast(page, text?)` — the
  app doesn't have a toast/notification component yet; these target the
  common conventions (`role="status"/"alert"`, `aria-live`, `.toast`) so
  they're ready as soon as one is added.

Example:

```ts
const consoleErrors = watchConsoleErrors(page);
const networkFailures = watchNetworkErrors(page);

await page.goto("/dashboard");

expectNoConsoleErrors(consoleErrors);
expectNoNetwork500(networkFailures);
```

### Assertion helpers (`tests/shared/utils/assertions.ts`)

`expectRevenue`, `expectProfit`, `expectCustomerCount`, and
`expectInventoryUpdated` all take a `Locator` already scoped to the number
you're checking (a stat card, a table cell, a badge) plus the expected
value — they parse VND/plain-number formatting so tests don't have to match
`Intl.NumberFormat` output exactly:

```ts
await expectRevenue(page.getByTestId("revenue-stat"), 12_345_000);
```

`expectOrderCompleted(page, orderId)` navigates to the order detail page
and checks the status badge reads "Hoàn thành".

## QA Wave 1 — Login / Customers / Products regression pack

25 tests: `tests/login/login-smoke.spec.ts` (5),
`tests/customers/customers-smoke.spec.ts` (10),
`tests/products/products-smoke.spec.ts` (10). Everything else
(`orders/`, `reports/`, `dashboard/`, `commission/`, `marketing/`,
`staff/`, `permission/`) is still empty, waiting for its own Wave.

**Auto-diagnostics.** Every spec in this pack imports `test`/`expect` from
`tests/shared/fixtures.ts`, not `@playwright/test` directly. That fixture
wires the Foundation's `watchConsoleErrors`/`watchNetworkErrors`/
`expectNoConsoleErrors`/`expectNoNetwork500` into every test automatically
(watching starts before the test body, assertions run right after) — no
per-test boilerplate needed, and it isn't optional per test.

**Database verification.** `tests/shared/utils/db.ts` uses the service-role
admin client (`lib/supabase/admin.ts`, reused not duplicated) to read/patch/
delete `customers`/`products` rows directly, bypassing RLS. Every
Create/Edit/Delete test checks the row itself, not just what the page
rendered ("never trust only the UI").

**Test data.** `tests/shared/utils/testData.ts` generates unique
`QA Customer <timestamp>` / `QA Product <timestamp>` names and matching
phone/code values per call, so tests never collide with real data or with
each other, including across parallel workers.

**Independence & cleanup.** Every test that creates data does it itself and
deletes it itself, in a `finally` block, using the DB helper directly —
not by depending on another test's delete flow. That keeps each test
runnable alone, in any order, and in parallel (`fullyParallel: true`
already means Playwright does run same-file tests concurrently, each with
its own isolated browser context — no shared login/session state to worry
about).

**Known fragility — read before "fixing" a failing test.** A few
assertions locate a specific table cell by column position
(`.locator("td").nth(2)`) because CustomerTable.tsx/ProductTable.tsx have
no `data-testid` on cells. These are documented at the top of each spec
file with the column order they depend on. If those tables are ever
restructured, these tests will fail for that reason, not because the
feature broke — that's a good candidate for a future package to add
`data-testid`s (not done here: out of scope, "do not modify application
code").

**Follow-up/VIP badges.** Both are seeded via `patchCustomer()` (direct DB
write) rather than through the Follow-up module's own UI or an
admin-configured "VIP" master-data option, so the test stays deterministic
and stays inside the Customers module's own responsibility (rendering the
badge), not the scheduling feature itself.

## What's intentionally NOT here yet

Orders, Reports, Dashboard, Commission, Marketing, Staff, and Permission
have no test suites yet — each is its own future Wave. No bug fixes and no
application-code changes were made building this pack; where the app's own
behavior mattered (e.g. cost price not being shown in the product list),
tests were written to match that reality rather than to assume it should
be different.
