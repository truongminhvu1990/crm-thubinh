import { test, expect } from "../shared/fixtures";
import { LoginPage, DashboardPage } from "../shared/pages";
import { loginAsOwner, logout, credentialsFor } from "../shared/utils";

/**
 * QA Wave 1 - Login regression pack. No test data is created here, so
 * there's nothing to clean up; each test is independently runnable and
 * parallel-safe because Playwright gives every test its own browser
 * context (fresh cookies/storage).
 */
test.describe("Login smoke pack", () => {
  test("Owner login reaches the dashboard", async ({ page }) => {
    await loginAsOwner(page);

    const dashboard = new DashboardPage(page);
    await dashboard.expectOpened();
  });

  test("Invalid password is rejected and stays on the login page", async ({ page }) => {
    const { email } = credentialsFor("OWNER");
    const login = new LoginPage(page);

    await login.login(email, `not-the-real-password-${Date.now()}`);

    await expect(login.errorMessage).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("Logout returns to the login page", async ({ page }) => {
    await loginAsOwner(page);
    await logout(page);

    const login = new LoginPage(page);
    await expect(login.emailInput).toBeVisible();
  });

  test("Session survives a full page refresh", async ({ page }) => {
    await loginAsOwner(page);

    await page.reload();

    const dashboard = new DashboardPage(page);
    await dashboard.expectOpened();
  });

  test("Unauthenticated access redirects to login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/);
    const login = new LoginPage(page);
    await expect(login.emailInput).toBeVisible();
  });
});
