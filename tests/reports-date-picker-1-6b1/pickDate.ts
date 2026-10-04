import { expect, Page } from "@playwright/test";

/**
 * Selects `iso` (yyyy-mm-dd) in the reusable DatePicker identified by its input's data-testid, using ONLY the calendar UI:
 * click the field, page months with the prev/next buttons until the target month shows, click the day. Works the same in
 * Chromium, WebKit (Safari engine) and Edge, desktop and mobile.
 */
export async function pickDate(page: Page, fieldTestId: string, iso: string): Promise<void> {
  await page.getByTestId(fieldTestId).click();
  const cal = page.getByTestId("date-calendar");
  await expect(cal).toBeVisible();
  const [y, m] = iso.split("-").map(Number);
  for (let i = 0; i < 60; i += 1) {
    const label = await cal.getByTestId("date-calendar-month").innerText(); // "Tháng 9/2026"
    const [cm, cy] = label.replace("Tháng ", "").split("/").map(Number);
    const diff = (y - cy) * 12 + (m - cm);
    if (diff === 0) break;
    await cal.getByTestId(diff < 0 ? "date-calendar-prev" : "date-calendar-next").click();
  }
  await cal.locator(`[data-date="${iso}"]`).click();
  await expect(cal).toBeHidden();
}
