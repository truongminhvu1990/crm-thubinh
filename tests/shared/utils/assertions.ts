import { Locator, Page, expect } from "@playwright/test";
import { OrderPage } from "../pages/OrderPage";

/**
 * Domain-level assertions on top of Playwright's `expect`. Each one takes a
 * Locator already scoped to the relevant stat card / table cell / badge —
 * these helpers don't know where on the page a number lives, only how to
 * read and compare it once you've found it.
 */

function parseAmount(text: string): number {
  // Strips VND formatting ("12.345.000 ₫", "12,345,000", "-5.000₫") down to
  // a plain integer so tests don't have to match Intl.NumberFormat output
  // character-for-character.
  const digits = text.replace(/[^0-9-]/g, "");
  return digits === "" || digits === "-" ? NaN : parseInt(digits, 10);
}

async function expectNumericLocator(locator: Locator, expected: number) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => parseAmount(await locator.innerText()))
    .toBe(expected);
}

export async function expectRevenue(locator: Locator, expectedVnd: number) {
  await expectNumericLocator(locator, expectedVnd);
}

export async function expectProfit(locator: Locator, expectedVnd: number) {
  await expectNumericLocator(locator, expectedVnd);
}

export async function expectCustomerCount(locator: Locator, expectedCount: number) {
  await expectNumericLocator(locator, expectedCount);
}

export async function expectInventoryUpdated(locator: Locator, expectedQuantity: number) {
  await expectNumericLocator(locator, expectedQuantity);
}

/** Navigates to the order detail page and checks its status badge reads "Hoàn thành". */
export async function expectOrderCompleted(page: Page, orderId: string) {
  const orderPage = new OrderPage(page);
  await orderPage.gotoDetail(orderId);
  await expect(page.getByText("Hoàn thành").first()).toBeVisible();
}
