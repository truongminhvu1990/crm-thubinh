import { test, expect } from "../shared/fixtures";
import { test as plainTest, type Page } from "@playwright/test";
import { LoginPage, DashboardPage } from "../shared/pages";
import { credentialsFor, waitForLoading, watchNetworkErrors, expectNoNetwork500 } from "../shared/utils";

/**
 * Regression pack for the post-login redirect.
 *
 * Under `next start` the sidebar rendered on /login prefetches /dashboard before the
 * user is signed in; proxy.ts answers that prefetch with a redirect to /login, and the
 * client Router Cache kept it, so a soft router.push("/dashboard") after a successful
 * login went back to /login. The login page now navigates with
 * window.location.assign(), which always sends a fresh document request.
 *
 * These tests only mean something against a production build (`next build` +
 * `next start`): `next dev` does not prefetch, so the first test skips itself instead
 * of passing without having exercised the trap.
 */

const isDashboard = (url: string) => new URL(url).pathname === "/dashboard";

/**
 * The shared autoDiagnostics fixture fails a test on any browser console error. Supabase
 * answers a wrong password with HTTP 400 and the browser logs that request failure, so the
 * wrong-password test runs on the plain Playwright `test` (without that fixture) and
 * tolerates exactly that one message: a console "status of 400" error whose source is the
 * /auth/v1/token endpoint. Any other console error or 5xx response still fails the test.
 */
function expectOnlyWrongPassword400(page: Page) {
  const tolerated: string[] = [];
  const unexpected: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const isWrongPassword400 =
      /status of 400/.test(msg.text()) && /\/auth\/v1\/token/.test(msg.location().url);
    (isWrongPassword400 ? tolerated : unexpected).push(msg.text());
  });
  return { tolerated, unexpected };
}

test.describe("Login hard navigation", () => {
  test("Successful login sends a fresh /dashboard document request that the server accepts", async ({
    page,
  }) => {
    const { email, password } = credentialsFor("OWNER");
    const login = new LoginPage(page);

    // Registered before the page loads so the pre-login prefetch cannot be missed.
    const prefetch = page
      .waitForResponse(
        (r) => isDashboard(r.url()) && !!r.request().headers()["next-router-prefetch"],
        { timeout: 10_000 }
      )
      .catch(() => null);

    await login.goto();
    const prefetchResponse = await prefetch;
    test.skip(
      !prefetchResponse,
      "No /dashboard prefetch observed (dev server?) - run against next build + next start"
    );

    // The trap: the unauthenticated prefetch was answered with a redirect to /login.
    expect(prefetchResponse!.status()).toBe(307);

    await login.fillCredentials(email, password);
    const navigation = page.waitForResponse(
      (r) => isDashboard(r.url()) && r.request().isNavigationRequest()
    );
    await login.submit();

    // A real document request was sent after login, and proxy.ts accepted the session.
    const navigationResponse = await navigation;
    expect(navigationResponse.status()).toBe(200);

    await expect(page).toHaveURL(/\/dashboard/);
    await new DashboardPage(page).expectOpened();
    // Let the dashboard's own fetch settle before the fixture checks the console.
    await waitForLoading(page);
  });

  plainTest("Wrong password stays on /login with an error and sends no /dashboard navigation", async ({
    page,
  }) => {
    const consoleErrors = expectOnlyWrongPassword400(page);
    const networkFailures = watchNetworkErrors(page);
    const { email } = credentialsFor("OWNER");
    const login = new LoginPage(page);

    const navigations: string[] = [];
    page.on("request", (r) => {
      if (isDashboard(r.url()) && r.isNavigationRequest()) navigations.push(r.url());
    });

    await login.login(email, `not-the-real-password-${Date.now()}`);

    await expect(login.errorMessage).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    expect(navigations).toEqual([]);

    expect(consoleErrors.unexpected, "Unexpected browser console errors").toEqual([]);
    expect(consoleErrors.tolerated, "The wrong-password 400 was not observed").toHaveLength(1);
    expectNoNetwork500(networkFailures);
  });

  test("Protected route without a session still redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/);
    await expect(new LoginPage(page).emailInput).toBeVisible();
  });
});
