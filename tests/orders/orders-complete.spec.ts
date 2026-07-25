import { test, expect } from "../shared/fixtures";
import { OrderPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  expectOrderCompleted,
  createTestCustomer,
  createTestProduct,
  getOrderByNumber,
  getOrderItemsByOrderId,
  getProductById,
  getCustomerPurchaseByOrderItemId,
  getSalesCommissionByPurchaseId,
  deleteOrderRow,
  deleteCustomerRow,
  deleteProductRow,
} from "../shared/utils";

/**
 * QA Wave 2 - Orders, GROUP 4: Complete Order.
 *
 * Every test creates its own Draft order (customer + one product via the
 * real UI), completes it, and verifies the full write path
 * complete_order_with_snapshots performs atomically: order_status ->
 * Completed, one customer_purchases row per item (order_item_id set), the
 * matching sales_commissions row, and the item's product Reserved -> Sold.
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

test.describe("Orders - Complete Order", () => {
  test("Complete transitions order_status to Completed and updates the UI status badge", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.complete();
      await waitForLoading(page);

      const updatedOrder = await getOrderByNumber(order.order_number);
      expect(updatedOrder!.order_status).toBe("Completed");

      await expectOrderCompleted(page, orderId!);
      // Once Completed, item editing closes - Complete/Mark Lost/Delete
      // buttons all disappear together (canEditOrderItems/canCompleteOrder/
      // canMarkOrderLost/canDeleteOrder all key off order_status).
      await expect(orders.completeButton).toBeHidden();
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Snapshot: completing creates one customer_purchases row per order_item, linked via order_item_id", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      const items = await getOrderItemsByOrderId(orderId!);
      expect(items).toHaveLength(1);
      const item = items[0];

      // No snapshot exists yet - only created on completion, not creation.
      const beforeComplete = await getCustomerPurchaseByOrderItemId(item.id!);
      expect(beforeComplete).toBeNull();

      await orders.complete();
      await waitForLoading(page);

      const purchase = await getCustomerPurchaseByOrderItemId(item.id!);
      expect(purchase).not.toBeNull();
      expect(purchase!.customer_id).toBe(customer.id);
      expect(purchase!.product_id).toBe(product.id);
      expect(purchase!.sale_price).toBe(item.line_total);

      const commission = await getSalesCommissionByPurchaseId(purchase!.id!);
      expect(commission).not.toBeNull();
      expect(commission!.sale_amount).toBe(item.line_total);
      expect(commission!.status).toBe("Pending");
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Inventory: completing moves the product from Reserved to Sold", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      const beforeComplete = await getProductById(product.id!);
      expect(beforeComplete!.status).toBe("Reserved");

      await orders.complete();
      await waitForLoading(page);

      const afterComplete = await getProductById(product.id!);
      expect(afterComplete!.status).toBe("Sold");
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Customer purchase created reflects the order's own business date (order_date), not just 'today'", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      const items = await getOrderItemsByOrderId(orderId!);
      await orders.complete();
      await waitForLoading(page);

      const purchase = await getCustomerPurchaseByOrderItemId(items[0].id!);
      // Business Time Migration, Wave 1: sale_date is a direct passthrough
      // of order.order_date (lib/orders/order.service.ts's completeOrder())
      // - this is the exact mechanism that package's own regression tests
      // cover at the unit level; here it's confirmed end-to-end through the
      // real UI and a real database row.
      expect(purchase!.sale_date).toBe(order.order_date);
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Complete is blocked when the order has no items (validateOrderHasItems)", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      const order = await createDraftOrderWithItem(page, orders, customer.phone, customer.full_name, product.product_code, product.product_name);
      orderId = order.id;

      await orders.removeItemRow(product.product_name);
      await waitForLoading(page);

      await expect(orders.completeButton).toBeDisabled();
      await expect(page.getByText("Vui lòng thêm ít nhất một sản phẩm")).toBeVisible();

      const updatedOrder = await getOrderByNumber(order.order_number);
      expect(updatedOrder!.order_status).toBe("Draft");
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });
});
