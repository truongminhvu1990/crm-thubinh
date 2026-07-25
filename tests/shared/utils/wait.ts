import { Page } from "@playwright/test";

/**
 * Waits for the app's loading state to clear. Pages in this codebase render
 * a Tailwind `animate-spin` spinner (or a "Đang tải..." label) while
 * `isLoading` is true; both disappear once data has arrived.
 */
export async function waitForLoading(page: Page, timeout = 15_000) {
  await page.waitForLoadState("domcontentloaded");

  const spinner = page.locator(".animate-spin");
  const spinnerCount = await spinner.count();
  if (spinnerCount > 0) {
    await spinner
      .first()
      .waitFor({ state: "hidden", timeout })
      .catch(() => {
        // Some spinners live inside buttons and never fully detach; a
        // timeout here just means "moved on", not "still loading forever".
      });
  }

  await page.waitForLoadState("networkidle", { timeout }).catch(() => {
    // Long-polling / SSE connections can keep the network non-idle
    // indefinitely — don't fail the test over it.
  });
}
