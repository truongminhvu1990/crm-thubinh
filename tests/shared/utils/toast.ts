import { Page, expect } from "@playwright/test";

/**
 * The app has no toast/notification component yet (checked 2026-07-25 —
 * forms currently show inline success/error state instead). These helpers
 * target the conventions most notification libraries use (role="status"/
 * "alert", aria-live regions, a `.toast` class) so they work as soon as one
 * is added, without every future test having to guess the selector.
 */
const TOAST_SELECTOR = [
  '[role="status"]',
  '[role="alert"]',
  "[aria-live]",
  "[data-sonner-toast]",
  ".toast",
].join(", ");

const SUCCESS_TOAST_SELECTOR = `${TOAST_SELECTOR}, [data-type="success"], .toast-success`;
const ERROR_TOAST_SELECTOR = `${TOAST_SELECTOR}, [data-type="error"], .toast-error`;

export async function expectSuccessToast(page: Page, text?: string | RegExp) {
  const toast = page.locator(SUCCESS_TOAST_SELECTOR).filter({ hasText: text ?? /.+/ });
  await expect(toast.first()).toBeVisible();
}

export async function expectErrorToast(page: Page, text?: string | RegExp) {
  const toast = page.locator(ERROR_TOAST_SELECTOR).filter({ hasText: text ?? /.+/ });
  await expect(toast.first()).toBeVisible();
}
