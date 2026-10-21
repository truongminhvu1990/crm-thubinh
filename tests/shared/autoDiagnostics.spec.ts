import type { Page, Route } from "@playwright/test";
import { test as base, expect } from "./fixtures";
import type { ExpectedDiagnostics } from "./utils/diagnostics";

/**
 * Integration tests of the shared `autoDiagnostics` fixture itself (tests/shared/fixtures.ts), end to end through
 * Playwright's real console / pageerror / response events - not just partitionDiagnostics on hand-built input.
 *
 * No application, login, Supabase or .env is involved. The page is served entirely by Playwright routes on an origin
 * that can never resolve (`.invalid`), a catch-all route aborts everything else, and every test asserts that nothing
 * outside the stubbed origin was requested.
 *
 * Negative controls ("the fixture must reject this") use `test.fail()`: the test counts as passed only if
 * autoDiagnostics fails it. `test.fail()` alone cannot tell WHY it failed, so the `expectedDiagnostics` fixture is
 * overridden below to record each test's final errors (after autoDiagnostics has torn down), and the last test asserts
 * every control was rejected for exactly the intended reason. Each control also has a positive twin that emits the same
 * events with the matching declaration and passes, so the control's failure is attributable to the declaration alone.
 */

// Fixture teardown runs in reverse dependency order: autoDiagnostics (which needs expectedDiagnostics) is torn down
// first, so by the time this override resumes after `use`, testInfo.errors holds autoDiagnostics' verdict.
// Each error is kept separately (message + stack): joining them would let a body error hide next to the fixture's.
type RecordedError = { message: string; stack: string };
const finalErrors = new Map<string, RecordedError[]>();
const ANSI = /\u001b\[[0-9;]*m/g;
const test = base.extend({
  // Array form, as in fixtures.ts: a named property function makes react-hooks/rules-of-hooks mistake `use` for a hook.
  expectedDiagnostics: [
    async ({ expectedDiagnostics }, use, testInfo) => {
      await use(expectedDiagnostics);
      finalErrors.set(
        testInfo.title,
        testInfo.errors.map((e) => ({ message: (e.message ?? "").replace(ANSI, ""), stack: (e.stack ?? "").replace(ANSI, "") }))
      );
    },
    { scope: "test" },
  ],
});

// The controls and the final reasons check share module state, so they must run in order in one worker.
test.describe.configure({ mode: "serial" });

const ORIGIN = "http://autodiag.invalid";

/** Everything is served by routes; anything not served is recorded in `unmocked` and aborted. */
async function isolatedOrigin(page: Page) {
  const unmocked: string[] = [];
  const served: string[] = [];

  // Registered first = lowest precedence: the default for every URL is "block and record".
  await page.route("**/*", (route: Route) => {
    unmocked.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort();
  });
  await page.route(`${ORIGIN}/**`, (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/") {
      served.push(path);
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>autodiag</title><p>ok</p>" });
    }
    if (path === "/favicon.ico") return route.fulfill({ status: 204 });
    if (path === "/api/e500" || path === "/api/other500") {
      served.push(path);
      return route.fulfill({ status: 500, json: { error: "stub" } });
    }
    if (path === "/api/e503") {
      served.push(path);
      return route.fulfill({ status: 503, json: { error: "stub" } });
    }
    unmocked.push(`${request.method()} ${request.url()}`);
    return route.abort();
  });

  await page.goto(`${ORIGIN}/`);
  return { unmocked, served };
}

async function consoleError(page: Page, text: string) {
  const seen = page.waitForEvent("console", (m) => m.type() === "error" && m.text() === text);
  await page.evaluate((t) => console.error(t), text);
  await seen;
}

/** Fetches a stubbed endpoint; Chromium logs "Failed to load resource" for any >= 400 response. */
async function fetchFailing(page: Page, path: string) {
  const seen = page.waitForEvent("console", (m) => m.type() === "error" && m.text().startsWith("Failed to load resource"));
  const status = await page.evaluate((p) => fetch(p).then((r) => r.status), path);
  await seen;
  return status;
}

async function uncaughtError(page: Page, message: string) {
  const thrown = page.waitForEvent("pageerror");
  await page.evaluate((m) => {
    setTimeout(() => {
      throw new Error(m);
    }, 0);
  }, message);
  await thrown;
}

const resourceError = (status: number, url: RegExp) => ({
  text: new RegExp(`^Failed to load resource: the server responded with a status of ${status}`),
  url,
});
const E500 = /\/api\/e500$/;
const OTHER500 = /\/api\/other500$/;
const E503 = /\/api\/e503$/;
const EXPECTED_CONSOLE = "autodiag: expected console error";

const DECLARED: ExpectedDiagnostics = {
  network5xx: [{ status: 500, url: E500 }],
  consoleErrors: [resourceError(500, E500), { text: /^autodiag: expected console error$/ }],
};

/** What the page does in the "declared and it happens" scenario. */
async function emitDeclared(page: Page) {
  await consoleError(page, EXPECTED_CONSOLE);
  expect(await fetchFailing(page, "/api/e500")).toBe(500);
}

const T = {
  clean: "clean page, nothing declared: passes",
  declaredOccurs: "declared console error and 500 both occur: passes",
  declaredMissing: "CONTROL declared diagnostics that never occur: fixture fails the test",
  undeclaredConsole: "CONTROL undeclared console.error: fixture fails the test",
  undeclaredPageError: "CONTROL uncaught page error is never accepted, even with a matching console declaration",
  extraAlongsideDeclared: "CONTROL declared diagnostics occur but an undeclared error appears too: fixture fails the test",
  wrongStatus: "CONTROL 5xx with a different status than declared: fixture fails the test",
  wrongUrl: "CONTROL 5xx on a different URL than declared: fixture fails the test",
  reasons: "the controls above were each rejected for exactly the intended reason",
} as const;

test.describe("autoDiagnostics fixture", () => {
  test(T.clean, async ({ page }) => {
    const { unmocked } = await isolatedOrigin(page);
    expect(unmocked).toEqual([]);
  });

  test(T.declaredOccurs, async ({ page, expectedDiagnostics }) => {
    expectedDiagnostics.expect(DECLARED);
    const { unmocked, served } = await isolatedOrigin(page);

    await emitDeclared(page);

    expect(served).toContain("/api/e500");
    expect(unmocked).toEqual([]);
  });

  test(T.declaredMissing, async ({ page, expectedDiagnostics }) => {
    test.fail();
    expectedDiagnostics.expect(DECLARED);
    const { unmocked } = await isolatedOrigin(page);

    // Only the console error happens; the 500 response and Chromium's report of it never do.
    await consoleError(page, EXPECTED_CONSOLE);

    expect(unmocked).toEqual([]);
  });

  test(T.undeclaredConsole, async ({ page }) => {
    test.fail();
    const { unmocked } = await isolatedOrigin(page);

    await consoleError(page, "autodiag: undeclared console error");

    expect(unmocked).toEqual([]);
  });

  test(T.undeclaredPageError, async ({ page, expectedDiagnostics }) => {
    test.fail();
    // A console declaration whose text matches the uncaught error's message must still not cover a pageerror.
    expectedDiagnostics.expect({ consoleErrors: [{ text: /autodiag: uncaught/ }] });
    const { unmocked } = await isolatedOrigin(page);

    await uncaughtError(page, "autodiag: uncaught page error");

    expect(unmocked).toEqual([]);
  });

  test(T.extraAlongsideDeclared, async ({ page, expectedDiagnostics }) => {
    test.fail();
    expectedDiagnostics.expect(DECLARED);
    const { unmocked } = await isolatedOrigin(page);

    await emitDeclared(page);
    await consoleError(page, "autodiag: extra undeclared error");

    expect(unmocked).toEqual([]);
  });

  test(T.wrongStatus, async ({ page, expectedDiagnostics }) => {
    test.fail();
    // Chromium's report of the 503 is declared, so only the 5xx rule (status 500 declared, 503 served) can reject it.
    expectedDiagnostics.expect({ network5xx: [{ status: 500, url: E503 }], consoleErrors: [resourceError(503, E503)] });
    const { unmocked } = await isolatedOrigin(page);

    expect(await fetchFailing(page, "/api/e503")).toBe(503);

    expect(unmocked).toEqual([]);
  });

  test(T.wrongUrl, async ({ page, expectedDiagnostics }) => {
    test.fail();
    // The 5xx rule names /api/e500, the 500 is served on /api/other500; Chromium's report of it is declared.
    expectedDiagnostics.expect({ network5xx: [{ status: 500, url: E500 }], consoleErrors: [resourceError(500, OTHER500)] });
    const { unmocked } = await isolatedOrigin(page);

    expect(await fetchFailing(page, "/api/other500")).toBe(500);

    expect(unmocked).toEqual([]);
  });

  // Runs after the tests above (serial mode, same worker) and reads what the override recorded for each of them.
  test(T.reasons, () => {
    // A control is only valid if its ONLY error is autoDiagnostics' own: exactly one recorded error, raised from
    // utils/diagnostics.ts (the fixture's expect helpers), not from this file. A body failure (a broken stub, a failed
    // `unmocked` check, a timeout) adds a second error - autoDiagnostics' teardown still runs and still reports - or
    // replaces it, and either way this fails. Returns that single error's message.
    const errors = (title: string) => {
      const recorded = finalErrors.get(title);
      expect(recorded, `no errors were recorded for "${title}" (did it run?)`).toBeDefined();
      expect(recorded!.map((e) => e.message), `"${title}" must end with exactly one error`).toHaveLength(1);
      expect(recorded![0].stack, `"${title}": the single error must come from the fixture's diagnostics helpers`).toMatch(
        /utils[\\/]diagnostics\.ts/
      );
      return recorded![0].message;
    };

    // The positives ended with no error at all.
    expect(finalErrors.get(T.clean)).toEqual([]);
    expect(finalErrors.get(T.declaredOccurs)).toEqual([]);

    // Declared but never happened: only the "missing" assertion fires, naming both missing rules.
    expect(errors(T.declaredMissing)).toMatch(/Declared diagnostics did not occur:[\s\S]*Failed to load resource[\s\S]*500 response from/);
    expect(errors(T.declaredMissing)).not.toMatch(/Unexpected/);

    expect(errors(T.undeclaredConsole)).toMatch(/Unexpected browser console errors:\nautodiag: undeclared console error/);

    // The page error is reported although a console rule matched its text.
    expect(errors(T.undeclaredPageError)).toMatch(/Unexpected browser console errors:\nautodiag: uncaught page error/);

    // Only the extra error is reported; the declared ones are accepted.
    expect(errors(T.extraAlongsideDeclared)).toMatch(/Unexpected browser console errors:\nautodiag: extra undeclared error/);
    expect(errors(T.extraAlongsideDeclared)).not.toContain(EXPECTED_CONSOLE);
    expect(errors(T.extraAlongsideDeclared)).not.toContain("Failed to load resource");

    // Console was declared in both, so the 5xx assertion is the one that fired, naming the served status / URL.
    expect(errors(T.wrongStatus)).toMatch(/Unexpected 5xx responses:\n503 http:\/\/autodiag\.invalid\/api\/e503/);
    expect(errors(T.wrongUrl)).toMatch(/Unexpected 5xx responses:\n500 http:\/\/autodiag\.invalid\/api\/other500/);
  });
});
