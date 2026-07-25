import { test } from "@playwright/test";
import { LoginPage, DashboardPage } from "../shared/pages";
import { loginAsOwner, logout } from "../shared/utils";

test.describe("Login", () => {
  test("Owner can log in, land on the dashboard, and log out", async ({ page }) => {
    await loginAsOwner(page);

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.expectOpened();

    await logout(page);

    const loginPage = new LoginPage(page);
    await loginPage.emailInput.waitFor({ state: "visible" });
  });
});
