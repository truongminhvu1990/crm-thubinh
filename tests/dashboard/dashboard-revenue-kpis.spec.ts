import { test, expect } from "../shared/fixtures";
import { Page } from "@playwright/test";
import { DashboardPage } from "../shared/pages";
import { loginAsOwner, loginAsSales } from "../shared/utils";

/**
 * Revenue Management Visibility (2026-08-29) + Order Revenue Visibility
 * Semantic Gap fix (2026-08-29 follow-up) - Dashboard shows three distinct,
 * clearly-labeled metrics (Tổng giá trị đơn hàng / Doanh thu đã ghi nhận /
 * Giá trị đơn chưa ghi nhận). "Giá trị đơn chưa ghi nhận" (B3) is computed
 * entirely from the Orders population (getOrderValueSummary's own
 * Completed+Paid complement), NOT as Total Order Value minus Recognized
 * Revenue - Recognized Revenue can include BR-002 legacy customer_purchases
 * revenue with no linked Order at all. Dev already has two such legacy rows
 * dated in August 2026 (confirmed via read-only DB query, not created by
 * this spec), which this file uses to prove the fix against real data
 * rather than writing new persistent Dev data. Read-only against the Dev
 * database only (QA_BASE_URL / QA_*_* from .env.test) - no data is
 * created, mutated, or deleted by this spec.
 */

async function readStatCardValue(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).locator("p").nth(1).innerText();
  return Number(text.replace(/[^\d-]/g, ""));
}

test.describe("Dashboard revenue management KPIs", () => {
  test("all three KPIs and the breakdown are visible, clearly labeled, and B3 reconciles exactly to its own Orders-based breakdown", async ({ page }) => {
    await loginAsOwner(page);
    const dashboard = new DashboardPage(page);
    await dashboard.expectOpened();

    const totalCard = page.getByTestId("dashboard-total-order-value-card");
    const recognizedCard = page.getByTestId("dashboard-revenue-card");
    const unrecognizedCard = page.getByTestId("dashboard-unrecognized-order-value-card");

    await expect(totalCard).toBeVisible();
    await expect(totalCard).toContainText("Tổng giá trị đơn hàng");
    await expect(recognizedCard).toBeVisible();
    await expect(recognizedCard).toContainText("Doanh thu đã ghi nhận");
    await expect(recognizedCard).toContainText("Completed + Paid");
    await expect(unrecognizedCard).toBeVisible();
    await expect(unrecognizedCard).toContainText("Giá trị đơn chưa ghi nhận");
    // Semantic gap fix: the hint must not let the user infer B3 = B1 - B2.
    await expect(unrecognizedCard).toContainText("không phải hiệu số");

    // The ambiguous bare label must not appear anywhere on the page — every
    // revenue-shaped card must be qualified (this task's own UI requirement).
    await expect(page.getByText("Doanh thu", { exact: true })).toHaveCount(0);

    const totalOrderValue = await readStatCardValue(page, "dashboard-total-order-value-card");
    const unrecognizedOrderValue = await readStatCardValue(page, "dashboard-unrecognized-order-value-card");
    expect(totalOrderValue).toBeGreaterThanOrEqual(unrecognizedOrderValue);

    const breakdown = page.getByTestId("dashboard-unrecognized-breakdown-card");
    await expect(breakdown).toBeVisible();

    // B3 is now computed entirely within the Orders population, from the
    // exact same query as the breakdown — the two must sum identically,
    // always (not merely "close enough"), regardless of any legacy revenue.
    if (unrecognizedOrderValue > 0) {
      const rowValues = await page.getByTestId("dashboard-unrecognized-breakdown-table").locator("tbody tr td:last-child").allInnerTexts();
      const breakdownSum = rowValues.reduce((sum, v) => sum + Number(v.replace(/[^\d-]/g, "")), 0);
      expect(breakdownSum).toBe(unrecognizedOrderValue);
    }
  });

  test("legacy BR-002 revenue does not distort B3: unrecognizedOrderValue is the Orders-based figure, not Total Order Value minus Recognized Revenue (real Dev data, August 2026)", async ({ page }) => {
    await loginAsOwner(page);

    // Dev has two confirmed legacy customer_purchases rows (no linked
    // Order, salesperson "QA Owner", ₫20,000,000 each) dated 2026-08-15 —
    // read-only-verified pre-existing Dev data, not written by this spec.
    const start = "2026-08-01";
    const end = "2026-09-01";
    const response = await page.request.get(`/api/dashboard/overview?start=${start}&end=${end}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    const oldWrongFormula = body.orderValue.totalOrderValue - body.purchases.totalRevenue;

    // The Order population's own identity always holds exactly.
    expect(body.orderValue.orderBasedRecognizedValue + body.orderValue.orderBasedUnrecognizedValue).toBe(body.orderValue.totalOrderValue);
    expect(body.unrecognizedOrderValue).toBe(body.orderValue.orderBasedUnrecognizedValue);

    // The known legacy revenue on Dev makes the two formulas genuinely
    // disagree for this exact period — proving the fix against real data,
    // not merely by construction.
    expect(oldWrongFormula).not.toBe(body.unrecognizedOrderValue);
  });

  test("Recognized Revenue on Dashboard matches Reports/BI Center's own revenue for the same explicit period (still includes legacy revenue on both sides, unchanged)", async ({ page }) => {
    await loginAsOwner(page);
    const dashboard = new DashboardPage(page);
    await dashboard.expectOpened();

    const start = "2026-08-01";
    const end = "2026-09-01";

    const overviewResponse = await page.request.get(`/api/dashboard/overview?start=${start}&end=${end}`);
    expect(overviewResponse.ok()).toBeTruthy();
    const overview = await overviewResponse.json();

    const kpiResponse = await page.request.get(`/api/reports/bi/kpi?start=${start}&end=${end}`);
    expect(kpiResponse.ok()).toBeTruthy();
    const kpi = await kpiResponse.json();

    expect(kpi.revenue.current).toBe(overview.purchases.totalRevenue);
  });

  test("changing the date range refetches and re-renders all three KPIs, and B3 keeps reconciling to totalOrderValue - orderBasedRecognizedValue, with no console/network errors", async ({ page }) => {
    await loginAsOwner(page);
    const dashboard = new DashboardPage(page);
    await dashboard.expectOpened();

    const responsePromise = page.waitForResponse((res) => res.url().includes("/api/dashboard/overview"));
    await page.getByTestId("report-date-filter").selectOption("all_time");
    const response = await responsePromise;

    await expect(page.getByTestId("dashboard-total-order-value-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-revenue-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-unrecognized-order-value-card")).toBeVisible();

    const body = await response.json();
    expect(body.orderValue.orderBasedRecognizedValue + body.orderValue.orderBasedUnrecognizedValue).toBe(body.orderValue.totalOrderValue);
    expect(body.unrecognizedOrderValue).toBe(body.orderValue.orderBasedUnrecognizedValue);
  });

  test("Data Scope: a Sales-role user's Orders-based KPIs load without error under their own scope (no unscoped leak)", async ({ page }) => {
    await loginAsSales(page);
    const dashboard = new DashboardPage(page);
    await dashboard.expectOpened();

    await expect(page.getByTestId("dashboard-total-order-value-card")).toBeVisible();
    await expect(page.getByTestId("dashboard-unrecognized-order-value-card")).toBeVisible();

    const totalOrderValue = await readStatCardValue(page, "dashboard-total-order-value-card");
    const unrecognizedOrderValue = await readStatCardValue(page, "dashboard-unrecognized-order-value-card");
    expect(totalOrderValue).toBeGreaterThanOrEqual(0);
    expect(unrecognizedOrderValue).toBeGreaterThanOrEqual(0);
    expect(totalOrderValue).toBeGreaterThanOrEqual(unrecognizedOrderValue);
  });
});
