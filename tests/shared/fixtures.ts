import { test as base, expect } from "@playwright/test";
import {
  watchConsoleErrors,
  watchNetworkErrors,
  expectNoConsoleErrors,
  expectNoNetwork500,
} from "./utils/diagnostics";

/**
 * QA Wave 1 rule: every test must verify no console errors and no network
 * 5xx responses. Rather than repeating the Foundation's watch/expect pairs
 * (tests/shared/utils/diagnostics.ts) in every spec, this fixture wires
 * them into every test automatically - `page` is being watched before the
 * test body runs, and asserted right after it finishes.
 *
 * Spec files import `test`/`expect` from here instead of "@playwright/test".
 */
export const test = base.extend<{ autoDiagnostics: void }>({
  autoDiagnostics: [
    async ({ page }, use) => {
      const consoleErrors = watchConsoleErrors(page);
      const networkFailures = watchNetworkErrors(page);

      await use();

      expectNoConsoleErrors(consoleErrors);
      expectNoNetwork500(networkFailures);
    },
    { auto: true },
  ],
});

export { expect };
