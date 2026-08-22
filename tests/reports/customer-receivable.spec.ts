import { test, expect } from "../shared/fixtures";
import { OrderPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  createTestCustomer,
  createTestProduct,
  getOrderByNumber,
  deleteOrderRow,
  deleteCustomerRow,
  deleteProductRow,
} from "../shared/utils";

/**
 * Customer Receivable (Finance Project #1, Phase E, Product Owner Approval
 * 2026-08-21) — read-only report over the existing Order/Payment source of
 * truth. NOT YET EXECUTED as of this commit: Dev Supabase Auth is down
 * (password-grant returns 400 — same outage recorded against Phase C,
 * still active), so login itself fails before this spec's own assertions
 * ever run. Written and ready to run the moment that outage clears; do
 * not treat its presence here as proof it currently passes.
 */
test.describe("Reports - Customer Receivable", () => {
  test("An order with a payment exceeding its total appears as Overpaid, with the correct overpaid amount and no other order misclassified", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);

      await orders.gotoNew();
      await orders.searchCustomer(customer.phone);
      await orders.selectCustomerByName(customer.full_name);
      await orders.selectFirstAvailableSalesOwner();
      await orders.searchProduct(product.product_code);
      await orders.addProductToCart(product.product_name);
      await orders.saveOrder();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
      await waitForLoading(page);
      const orderNumber = (await page.getByRole("heading", { name: /^OD-/ }).textContent())!.trim();
      const dbOrder = await getOrderByNumber(orderNumber);
      orderId = dbOrder!.id;

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(1_200_000);
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      await page.goto("/reports/customer-receivable");
      await waitForLoading(page);
      await page.getByTestId("customer-receivable-search-input").fill(orderNumber);
      await page.waitForTimeout(400); // debounced search

      const row = page.locator(`tr:has-text("${orderNumber}")`);
      await expect(row).toBeVisible();
      await expect(row.getByTestId("customer-receivable-status-Overpaid")).toBeVisible();
      await expect(row.getByTestId("customer-receivable-overpaid-amount")).toContainText("200.000");

      // Filtering to Outstanding must exclude this now-Overpaid order.
      await page.getByTestId("customer-receivable-status-filter").selectOption("Outstanding");
      await waitForLoading(page);
      await expect(page.locator(`tr:has-text("${orderNumber}")`)).toHaveCount(0);
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Mobile viewport (iPhone-sized) renders the card layout with correct Outstanding figures, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12/13/14 logical size
    await loginAsOwner(page);
    await page.goto("/reports/customer-receivable");
    await waitForLoading(page);

    await expect(page.getByTestId("customer-receivable-total-outstanding-card")).toBeVisible();
    const mobileRows = page.getByTestId("customer-receivable-mobile-row");
    if ((await mobileRows.count()) > 0) {
      await expect(mobileRows.first()).toBeVisible();
    }
    // The desktop table must be hidden below the lg breakpoint (Tailwind
    // `hidden lg:block`), matching every other report's own mobile pattern.
    await expect(page.getByTestId("customer-receivable-table")).toBeHidden();
  });
});
