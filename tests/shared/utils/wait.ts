import { Page } from "@playwright/test";

/**
 * Waits for the app's loading state to clear. Pages in this codebase render
 * a Tailwind `animate-spin` spinner (or a "Đang tải..." label) while
 * `isLoading` is true; both disappear once data has arrived.
 */
export async function waitForLoading(page: Page, timeout = 15_000) {
  await page.waitForLoadState("domcontentloaded");

  const spinner = page.locator(".animate-spin");
  // A caller-triggered refetch (e.g. a modal's onSaved callback calling
  // loadOrder(), which sets isLoading=true asynchronously) can take a
  // render cycle to actually mount the spinner. A single synchronous
  // spinner.count() check right here can race ahead of that — it can
  // observe "0 spinners" a moment before the refetch's own state update
  // has committed, then return immediately without ever having waited for
  // it, well before the refetched data (and whatever the caller wants to
  // assert next, e.g. a status badge) has actually arrived. Polling
  // briefly (bounded, not a blind sleep — this is watching for a real
  // signal, the spinner's own appearance) closes that window; a page that
  // was never going to show one at all (already loaded, or loads
  // synchronously) simply falls through once this short budget elapses.
  const spinnerAppeared = await spinner
    .first()
    .waitFor({ state: "visible", timeout: 300 })
    .then(() => true)
    .catch(() => false);
  if (spinnerAppeared) {
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
