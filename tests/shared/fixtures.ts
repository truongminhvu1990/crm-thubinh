import { test as base, expect } from "@playwright/test";
import {
  watchConsoleErrorEvents,
  watchNetworkErrors,
  partitionDiagnostics,
  createExpectedDiagnosticsRegistry,
  expectNoConsoleErrors,
  expectNoNetwork500,
  expectDeclaredDiagnosticsOccurred,
  type ExpectedDiagnosticsRegistry,
} from "./utils/diagnostics";

/**
 * QA Wave 1 rule: every test must verify no console errors and no network
 * 5xx responses. Rather than repeating the Foundation's watch/expect pairs
 * (tests/shared/utils/diagnostics.ts) in every spec, this fixture wires
 * them into every test automatically - `page` is being watched before the
 * test body runs, and asserted right after it finishes.
 *
 * A test that deliberately provokes a failure may declare it through the
 * `expectedDiagnostics` fixture (see diagnostics.ts). Nothing is exempt by
 * default; undeclared errors still fail, and so does a declaration that
 * never occurred.
 *
 * Spec files import `test`/`expect` from here instead of "@playwright/test".
 */
export const test = base.extend<{
  autoDiagnostics: void;
  expectedDiagnostics: ExpectedDiagnosticsRegistry;
}>({
  expectedDiagnostics: [
    async ({}, use) => {
      await use(createExpectedDiagnosticsRegistry());
    },
    { scope: "test" },
  ],

  autoDiagnostics: [
    async ({ page, expectedDiagnostics }, use) => {
      const consoleErrors = watchConsoleErrorEvents(page);
      const networkFailures = watchNetworkErrors(page);

      await use();

      const { unexpectedConsole, unexpectedNetwork, missing } = partitionDiagnostics(
        consoleErrors,
        networkFailures,
        expectedDiagnostics.declared
      );
      expectNoConsoleErrors(unexpectedConsole);
      expectNoNetwork500(unexpectedNetwork);
      expectDeclaredDiagnosticsOccurred(missing);
    },
    { auto: true },
  ],
});

export { expect };
