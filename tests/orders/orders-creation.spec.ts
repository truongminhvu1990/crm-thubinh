import { test, expect } from "../shared/fixtures";
import { OrderPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  createTestCustomer,
  createTestProduct,
  getOrderByNumber,
  getOrdersByCustomerId,
  deleteOrderRow,
  deleteCustomerRow,
  deleteProductRow,
} from "../shared/utils";

/**
 * QA Wave 2 - Orders, GROUP 1: Order Creation.
 *
 * Every test creates its own customer/product fixtures directly via the DB
 * (tests/shared/utils/db.ts's createTestCustomer/createTestProduct -
 * Customer/Product creation itself is Wave 1's job, already covered there;
 * these are Orders tests' preconditions, not what's under test) and cleans
 * up everything it created in a `finally` block, independent of any other
 * test - deleteOrderRow() cascades order_items/payments/order_events and
 * removes any customer_purchases/sales_commissions snapshot rows first
 * (see its own doc comment), so it's always safe to call even for an order
 * that was never completed.
 */
test.describe("Orders - Order Creation", () => {
  test("Open order list", async ({ page }) => {
    await loginAsOwner(page);
    const orders = new OrderPage(page);
    await orders.goto();
    await waitForLoading(page);

    await orders.expectOpened();
  });

  test("Create order persists to the database", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct();
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoNew();
      await orders.expectNewOrderFormOpened();

      await orders.searchCustomer(customer.phone);
      await orders.selectCustomerByName(customer.full_name);
      const salesOwner = await orders.selectFirstAvailableSalesOwner();

      await orders.searchProduct(product.product_code);
      await orders.addProductToCart(product.product_name);

      await orders.saveOrder();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
      await waitForLoading(page);

      const orderNumberHeading = page.getByRole("heading", { name: /^OD-/ });
      await expect(orderNumberHeading).toBeVisible();
      const orderNumber = (await orderNumberHeading.textContent())!.trim();

      const dbOrder = await getOrderByNumber(orderNumber);
      expect(dbOrder).not.toBeNull();
      orderId = dbOrder!.id;
      expect(dbOrder!.customer_id).toBe(customer.id);
      expect(dbOrder!.sales_owner).toBe(salesOwner);
      expect(dbOrder!.order_status).toBe("Draft");
      expect(dbOrder!.payment_status).toBe("Unpaid");
      // Business Time Migration, Wave 1 - order_date is server-computed
      // (Vietnam business date), never client-supplied at creation; just
      // confirm it's a real, non-empty date string, not its exact value.
      expect(dbOrder!.order_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Validation blocks save when customer, sales owner, or products are missing", async ({ page }) => {
    await loginAsOwner(page);
    const orders = new OrderPage(page);
    await orders.gotoNew();
    await orders.expectNewOrderFormOpened();

    // No customer, no sales owner, no products at all.
    await orders.saveOrder();
    await expect(orders.fieldError("Vui lòng chọn khách hàng")).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/new/);
  });

  test("Validation blocks save when a customer and sales owner are set but the cart is empty", async ({ page }) => {
    const customer = await createTestCustomer();

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoNew();
      await orders.expectNewOrderFormOpened();

      await orders.searchCustomer(customer.phone);
      await orders.selectCustomerByName(customer.full_name);
      await orders.selectFirstAvailableSalesOwner();

      await orders.saveOrder();
      await expect(orders.fieldError("Vui lòng thêm ít nhất một sản phẩm")).toBeVisible();
      await expect(page).toHaveURL(/\/orders\/new/);
    } finally {
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Cancel discards the form without creating an order", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct();

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoNew();
      await orders.expectNewOrderFormOpened();

      await orders.searchCustomer(customer.phone);
      await orders.selectCustomerByName(customer.full_name);
      await orders.selectFirstAvailableSalesOwner();
      await orders.searchProduct(product.product_code);
      await orders.addProductToCart(product.product_name);

      await orders.cancelCreate();
      await expect(page).toHaveURL(/\/orders$/);

      const dbOrders = await getOrdersByCustomerId(customer.id!);
      expect(dbOrders).toEqual([]);
    } finally {
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Reload re-fetches the order list from the server", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct();
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

      await orders.goto();
      await waitForLoading(page);
      await orders.reload();
      await waitForLoading(page);
      await orders.search(orderNumber);
      await expect(orders.rowByOrderNumber(orderNumber)).toBeVisible();
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Search finds a freshly created order by order number", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct();
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

      await orders.goto();
      await waitForLoading(page);

      const row = orders.rowByOrderNumber(orderNumber);
      await orders.search(orderNumber);
      await expect(row).toBeVisible();

      await orders.search("no-such-order-number-xyz");
      await expect(row).toBeHidden();

      // Search also matches by customer name/phone (order.list filter, not
      // just order_number) - re-confirms the same row via the customer.
      await orders.search(customer.phone);
      await expect(row).toBeVisible();
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });
});
