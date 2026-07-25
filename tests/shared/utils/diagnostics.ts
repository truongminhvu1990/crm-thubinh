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

interface NetworkFailure {
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
