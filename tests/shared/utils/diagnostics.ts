import { Page, expect } from "@playwright/test";

/**
 * Console errors and network responses are events — they must be observed
 * as they happen, not queried after the fact. Call the `watch*` function
 * right after the page is created (before any navigation), then call the
 * matching `expect*` function at the point in the test where "no errors so
 * far" should hold.
 *
 * Example:
 *   const consoleErrors = watchConsoleErrors(page);
 *   await page.goto("/dashboard");
 *   expectNoConsoleErrors(consoleErrors);
 */
export function watchConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    errors.push(err.message);
  });

  return errors;
}

export function expectNoConsoleErrors(errors: string[]) {
  expect(errors, `Unexpected browser console errors:\n${errors.join("\n")}`).toEqual([]);
}

export interface NetworkFailure {
  status: number;
  url: string;
}

export function watchNetworkErrors(page: Page): NetworkFailure[] {
  const failures: NetworkFailure[] = [];

  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push({ status: response.status(), url: response.url() });
    }
  });

  return failures;
}

export function expectNoNetwork500(failures: NetworkFailure[]) {
  const message = failures.map((f) => `${f.status} ${f.url}`).join("\n");
  expect(failures, `Unexpected 5xx responses:\n${message}`).toEqual([]);
}

/**
 * Expected diagnostics - opt-in, per test, empty by default.
 *
 * A test that deliberately provokes a failure (e.g. stubs an API to return
 * 500) declares exactly which console errors and 5xx responses it expects.
 * Anything not matching a declaration is still reported by
 * expectNoConsoleErrors / expectNoNetwork500, and a declaration that never
 * occurred fails the test (expectDeclaredDiagnosticsOccurred), so the
 * exemption can neither widen silently nor outlive the behavior it covers.
 * Page errors (uncaught exceptions) can never be declared.
 */
export interface ConsoleErrorEvent {
  /** "console" = a console.error message; "pageerror" = an uncaught exception. */
  kind: "console" | "pageerror";
  text: string;
  /** Source of a console message: a script URL, or the failing request's URL for the browser's own network errors. Empty for page errors. */
  url: string;
}

/** Same events as watchConsoleErrors, with the detail needed to match a declaration. */
export function watchConsoleErrorEvents(page: Page): ConsoleErrorEvent[] {
  const events: ConsoleErrorEvent[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      events.push({ kind: "console", text: msg.text(), url: msg.location().url });
    }
  });

  page.on("pageerror", (err) => {
    events.push({ kind: "pageerror", text: err.message, url: "" });
  });

  return events;
}

export interface ExpectedConsoleError {
  text: RegExp;
  /** When set, the message's source URL must match too. */
  url?: RegExp;
}

export interface ExpectedNetwork5xx {
  status: number;
  url: RegExp;
}

export interface ExpectedDiagnostics {
  consoleErrors?: ExpectedConsoleError[];
  network5xx?: ExpectedNetwork5xx[];
}

export interface ExpectedDiagnosticsRegistry {
  readonly declared: Required<ExpectedDiagnostics>;
  expect(expected: ExpectedDiagnostics): void;
}

export function createExpectedDiagnosticsRegistry(): ExpectedDiagnosticsRegistry {
  const declared: Required<ExpectedDiagnostics> = { consoleErrors: [], network5xx: [] };
  return {
    declared,
    expect(expected) {
      declared.consoleErrors.push(...(expected.consoleErrors ?? []));
      declared.network5xx.push(...(expected.network5xx ?? []));
    },
  };
}

/**
 * Splits observed events into those no declaration covers (to be reported as
 * unexpected) and declarations that matched nothing (to be reported as
 * missing). With nothing declared, every event is unexpected.
 */
export function partitionDiagnostics(
  consoleErrors: ConsoleErrorEvent[],
  networkFailures: NetworkFailure[],
  declared: Required<ExpectedDiagnostics>
) {
  const consoleMatches = declared.consoleErrors.map(() => 0);
  const unexpectedConsole: string[] = [];
  for (const event of consoleErrors) {
    let covered = false;
    declared.consoleErrors.forEach((rule, i) => {
      if (event.kind === "console" && rule.text.test(event.text) && (!rule.url || rule.url.test(event.url))) {
        consoleMatches[i] += 1;
        covered = true;
      }
    });
    if (!covered) unexpectedConsole.push(event.text);
  }

  const networkMatches = declared.network5xx.map(() => 0);
  const unexpectedNetwork: NetworkFailure[] = [];
  for (const failure of networkFailures) {
    let covered = false;
    declared.network5xx.forEach((rule, i) => {
      if (failure.status === rule.status && rule.url.test(failure.url)) {
        networkMatches[i] += 1;
        covered = true;
      }
    });
    if (!covered) unexpectedNetwork.push(failure);
  }

  const missing = [
    ...declared.consoleErrors
      .filter((_, i) => consoleMatches[i] === 0)
      .map((rule) => `console error text ${rule.text}${rule.url ? ` from ${rule.url}` : ""}`),
    ...declared.network5xx
      .filter((_, i) => networkMatches[i] === 0)
      .map((rule) => `${rule.status} response from ${rule.url}`),
  ];

  return { unexpectedConsole, unexpectedNetwork, missing };
}

export function expectDeclaredDiagnosticsOccurred(missing: string[]) {
  expect(missing, `Declared diagnostics did not occur:\n${missing.join("\n")}`).toEqual([]);
}
