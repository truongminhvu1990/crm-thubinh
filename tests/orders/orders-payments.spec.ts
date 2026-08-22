import { test, expect } from "../shared/fixtures";
import { OrderPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  createTestCustomer,
  createTestProduct,
  getOrderByNumber,
  getPaymentsByOrderId,
  deleteOrderRow,
  deleteCustomerRow,
  deleteProductRow,
} from "../shared/utils";

/**
 * QA Wave 2 - Orders, GROUP 3: Payments.
 *
 * Every test creates its own Draft order (customer + one product, via the
 * real Create Order UI) as a precondition, then exercises the Add Payment
 * flow on Order Detail - Payments themselves are what's under test here,
 * order creation is just the arrange step.
 *
 * "Edit payment" / "Delete payment" have no UI or API in this application
 * (components/order/OrderPaymentsList.tsx's own comment: "No edit/delete
 * action, per the locked 'Payment: ADD ONLY' rule" - ORDERS_UI.md §8).
 * Per this framework's own precedent (tests/README.md: "tests were written
 * to match that reality rather than to assume it should be different"),
 * these two tests verify that absence directly instead of exercising a
 * feature that doesn't exist.
 */
async function createDraftOrderWithItem(page: import("@playwright/test").Page, orders: OrderPage, customerPhone: string, customerName: string, productCode: string, productName: string) {
  await orders.gotoNew();
  await orders.searchCustomer(customerPhone);
  await orders.selectCustomerByName(customerName);
  await orders.selectFirstAvailableSalesOwner();
  await orders.searchProduct(productCode);
  await orders.addProductToCart(productName);
  await orders.saveOrder();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  await waitForLoading(page);
  const orderNumber = (await page.getByRole("heading", { name: /^OD-/ }).textContent())!.trim();
  const dbOrder = await getOrderByNumber(orderNumber);
  return dbOrder!;
}

test.describe("Orders - Payments", () => {
  test("Add payment (partial) persists to the database and sets Partially Paid", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(400_000);
      const method = await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      const payments = await getPaymentsByOrderId(orderId!);
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(400_000);
      expect(payments[0].payment_method).toBe(method);

      const updatedOrder = await getOrderByNumber(order.order_number);
      expect(updatedOrder!.payment_status).toBe("Partially Paid");

      await expect(page.getByText(/Còn lại/)).toContainText("600.000");
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Add payment (full) sets Paid and shows no remaining balance", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(1_000_000);
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      const payments = await getPaymentsByOrderId(orderId!);
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(1_000_000);

      const updatedOrder = await getOrderByNumber(order.order_number);
      expect(updatedOrder!.payment_status).toBe("Paid");

      await expect(page.getByText("Đã thanh toán đủ")).toBeVisible();
      // Paid orders can no longer receive another payment (canAddPayment
      // rule) - the button itself disappears rather than erroring.
      await expect(orders.addPaymentButton).toBeHidden();
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Finance Project #1, Phase C — a payment exceeding the total is warned, never blocked, and shows an explicit Overpaid state (not silently 'fully paid')", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(1_200_000);
      // Warning-only (Product Owner Approval, 2026-08-21) — visible, but the
      // Save button must remain enabled and the submission must succeed.
      await expect(page.getByText("Số tiền vượt quá số dư còn lại")).toBeVisible();
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      // The full entered amount is persisted, never capped to the order total.
      const payments = await getPaymentsByOrderId(orderId!);
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(1_200_000);

      const updatedOrder = await getOrderByNumber(order.order_number);
      expect(updatedOrder!.payment_status).toBe("Paid");

      // Overpaid must be shown distinctly — not collapsed into "Đã thanh
      // toán đủ" (the exact regression this phase fixes).
      await expect(page.getByTestId("order-overpaid-badge")).toBeVisible();
      await expect(page.getByTestId("order-payment-settlement-summary")).toContainText("Khách đã trả dư");
      await expect(page.getByTestId("order-payment-settlement-summary")).toContainText("200.000");
      await expect(page.getByText("Đã thanh toán đủ")).toBeHidden();

      // Still Paid — no further payment can be added, same rule as an
      // exactly-paid order (canAddPayment), unchanged by this phase.
      await expect(orders.addPaymentButton).toBeHidden();
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Two partial payments accumulate toward the remaining balance", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(300_000);
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(300_000);
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      const payments = await getPaymentsByOrderId(orderId!);
      expect(payments).toHaveLength(2);
      const total = payments.reduce((sum, p) => sum + p.amount, 0);
      expect(total).toBe(600_000);

      const updatedOrder = await getOrderByNumber(order.order_number);
      expect(updatedOrder!.payment_status).toBe("Partially Paid");
      await expect(page.getByText(/Còn lại/)).toContainText("400.000");
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Edit payment: no such action exists (locked ADD ONLY rule, ORDERS_UI.md §8)", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(400_000);
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      const paymentRow = page.getByRole("row").filter({ hasText: "400.000" });
      await expect(paymentRow).toBeVisible();
      // OrderPaymentsList.tsx renders a plain read-only table row - no
      // edit button/icon of any kind next to a logged payment.
      await expect(paymentRow.getByRole("button")).toHaveCount(0);
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Delete payment: no such action exists (locked ADD ONLY rule, ORDERS_UI.md §8)", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(400_000);
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      const beforeCount = (await getPaymentsByOrderId(orderId!)).length;
      expect(beforeCount).toBe(1);

      // No delete affordance anywhere on the page for a logged payment -
      // reloading confirms the payment is still there, since nothing in
      // this UI can remove it once added.
      await orders.gotoDetail(orderId!);
      await waitForLoading(page);
      const afterCount = (await getPaymentsByOrderId(orderId!)).length;
      expect(afterCount).toBe(1);
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });
});
