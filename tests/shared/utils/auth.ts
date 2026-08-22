import { Page, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { waitForLoading } from "./wait";

export type QaRole = "OWNER" | "MANAGER" | "SALES" | "MARKETING" | "VIEWER";

interface QaCredentials {
  email: string;
  password: string;
}

/**
 * Reads QA_<ROLE>_EMAIL / QA_<ROLE>_PASSWORD from .env.test.
 * Throws with a clear message instead of silently logging in as nobody.
 */
export function credentialsFor(role: QaRole): QaCredentials {
  const email = process.env[`QA_${role}_EMAIL`];
  const password = process.env[`QA_${role}_PASSWORD`];

  if (!email || !password) {
    throw new Error(
      `Missing QA_${role}_EMAIL / QA_${role}_PASSWORD. Copy .env.test.example to ` +
        `.env.test and fill in a real Dev/staging Supabase account for the ${role} role.`
    );
  }

  return { email, password };
}

async function loginAs(page: Page, role: QaRole) {
  const { email, password } = credentialsFor(role);
  const loginPage = new LoginPage(page);
  await loginPage.login(email, password);
  await expect(page).toHaveURL(/\/dashboard/);
  // Dashboard fires its own stats fetch on mount and only clears its
  // loading spinner once that fetch settles (app/dashboard/page.tsx) — if
  // a caller navigates away before it resolves, the browser aborts the
  // in-flight request and Dashboard's own .catch() logs "Failed to load
  // dashboard stats: TypeError: Failed to fetch" to the console, which the
  // shared autoDiagnostics fixture (tests/shared/fixtures.ts) then fails
  // the test on — a false failure with no relation to whatever page the
  // test actually cares about. Waiting for the spinner to clear here (the
  // same existing waitForLoading() every other page in this suite already
  // uses) lets that fetch finish normally before any subsequent
  // navigation, closing the race at its source instead of pattern-matching
  // or filtering the resulting console error.
  await waitForLoading(page);
  return loginPage;
}

export const loginAsOwner = (page: Page) => loginAs(page, "OWNER");
export const loginAsManager = (page: Page) => loginAs(page, "MANAGER");
export const loginAsSales = (page: Page) => loginAs(page, "SALES");
export const loginAsMarketing = (page: Page) => loginAs(page, "MARKETING");
export const loginAsViewer = (page: Page) => loginAs(page, "VIEWER");

/** Clicks the header logout button and waits for the redirect to /login. */
export async function logout(page: Page) {
  await page.getByRole("button", { name: /đăng xuất/i }).click();
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Clears cookies + storage without navigating, so the next `page.goto`
 * starts from a logged-out state. Useful between role switches in a test
 * that doesn't want a fresh browser context.
 */
export async function resetSession(page: Page) {
  await page.context().clearCookies();
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Storage isn't accessible before the first navigation to the app's
    // origin (e.g. on about:blank) — nothing to clear in that case.
  }
}
