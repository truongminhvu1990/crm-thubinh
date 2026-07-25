import { test, expect } from "../shared/fixtures";
import { OrderPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  createTestCustomer,
  createTestProduct,
  getOrderByNumber,
  getOrderItemsByOrderId,
  getProductById,
  deleteOrderRow,
  deleteCustomerRow,
  deleteProductRow,
} from "../shared/utils";

/**
 * QA Wave 2 - Orders, GROUP 2: Order Items.
 *
 * Quantity/Discount/Total calculation tests exercise the cart on the
 * Create Order screen (app/orders/new/page.tsx) since that's where those
 * fields are directly editable per line before save - the Order Detail
 * page's "add item" flow (post-creation) always adds at quantity 1,
 * product.discount, full price (no per-line editing there), which is what
 * "Add product" / "Remove product" (Detail page) verify instead.
 */
test.describe("Orders - Order Items", () => {
  test("Add product to cart reserves it (Active -> Reserved) once the order is saved", async ({ page }) => {
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
      await expect(orders.cartLine(product.product_name)).toBeVisible();

      // Not yet reserved - the cart is still local UI state until save.
      const beforeSave = await getProductById(product.id!);
      expect(beforeSave!.status).toBe("Active");

      await orders.saveOrder();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
      await waitForLoading(page);

      const orderNumber = (await page.getByRole("heading", { name: /^OD-/ }).textContent())!.trim();
      const dbOrder = await getOrderByNumber(orderNumber);
      orderId = dbOrder!.id;

      const items = await getOrderItemsByOrderId(orderId!);
      expect(items).toHaveLength(1);
      expect(items[0].product_id).toBe(product.id);
      expect(items[0].quantity).toBe(1);

      const afterSave = await getProductById(product.id!);
      expect(afterSave!.status).toBe("Reserved");
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Remove product from the cart before save never persists it, product stays Active", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct();

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoNew();
      await orders.searchCustomer(customer.phone);
      await orders.selectCustomerByName(customer.full_name);
      await orders.selectFirstAvailableSalesOwner();

      await orders.searchProduct(product.product_code);
      await orders.addProductToCart(product.product_name);
      await expect(orders.cartLine(product.product_name)).toBeVisible();

      await orders.removeCartLine(product.product_name);
      await expect(orders.cartLine(product.product_name)).toBeHidden();

      // Cart is empty again - save should fail validation, not create an order.
      await orders.saveOrder();
      await expect(orders.fieldError("Vui lòng thêm ít nhất một sản phẩm")).toBeVisible();

      const dbProduct = await getProductById(product.id!);
      expect(dbProduct!.status).toBe("Active");
    } finally {
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Remove item on Order Detail releases the product back to Active", async ({ page }) => {
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

      const reserved = await getProductById(product.id!);
      expect(reserved!.status).toBe("Reserved");

      await orders.removeItemRow(product.product_name);
      await waitForLoading(page);
      await expect(orders.itemRowByProductName(product.product_name)).toBeHidden();

      const items = await getOrderItemsByOrderId(orderId!);
      expect(items).toHaveLength(0);

      const released = await getProductById(product.id!);
      expect(released!.status).toBe("Active");
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Quantity affects line_total (snapshot_sale_price * quantity - discount)", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000 });
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

      await orders.setCartLineQuantity(product.product_name, 3);
      await expect(orders.summaryValue("Tạm tính")).toHaveText(/3\.000\.000/);

      await orders.saveOrder();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
      await waitForLoading(page);

      const orderNumber = (await page.getByRole("heading", { name: /^OD-/ }).textContent())!.trim();
      const dbOrder = await getOrderByNumber(orderNumber);
      orderId = dbOrder!.id;

      const items = await getOrderItemsByOrderId(orderId!);
      expect(items[0].quantity).toBe(3);
      expect(items[0].line_total).toBe(3_000_000); // 1,000,000 * 3 - 0
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Discount affects line_total (ORDERS_SPEC.md: snapshot price * qty - discount)", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000 });
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

      await orders.setCartLineDiscount(product.product_name, 150_000);

      await orders.saveOrder();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
      await waitForLoading(page);

      const orderNumber = (await page.getByRole("heading", { name: /^OD-/ }).textContent())!.trim();
      const dbOrder = await getOrderByNumber(orderNumber);
      orderId = dbOrder!.id;

      const items = await getOrderItemsByOrderId(orderId!);
      expect(items[0].discount).toBe(150_000);
      expect(items[0].line_total).toBe(850_000); // 1,000,000 * 1 - 150,000
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("Total calculation: subtotal - discount total = order.total_amount, matching the UI summary and the database", async ({ page }) => {
    const customer = await createTestCustomer();
    const productA = await createTestProduct({ sale_price: 1_000_000 });
    const productB = await createTestProduct({ sale_price: 2_000_000 });
    let orderId: string | undefined;

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoNew();
      await orders.searchCustomer(customer.phone);
      await orders.selectCustomerByName(customer.full_name);
      await orders.selectFirstAvailableSalesOwner();

      await orders.searchProduct(productA.product_code);
      await orders.addProductToCart(productA.product_name);
      await orders.setCartLineDiscount(productA.product_name, 100_000);

      await orders.searchProduct(productB.product_code);
      await orders.addProductToCart(productB.product_name);
      await orders.setCartLineDiscount(productB.product_name, 200_000);

      // Subtotal (gross, pre-discount) = 1,000,000 + 2,000,000 = 3,000,000
      // Discount total = 100,000 + 200,000 = 300,000
      // Total = 3,000,000 - 300,000 = 2,700,000
      await expect(orders.summaryValue("Tạm tính")).toHaveText(/3\.000\.000/);
      await expect(orders.summaryValue("Giảm giá")).toHaveText(/300\.000/);
      await expect(orders.summaryValue("Tổng cộng")).toHaveText(/2\.700\.000/);

      await orders.saveOrder();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
      await waitForLoading(page);

      const orderNumber = (await page.getByRole("heading", { name: /^OD-/ }).textContent())!.trim();
      const dbOrder = await getOrderByNumber(orderNumber);
      orderId = dbOrder!.id;

      expect(dbOrder!.subtotal).toBe(3_000_000);
      expect(dbOrder!.discount_total).toBe(300_000);
      expect(dbOrder!.total_amount).toBe(2_700_000);
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(productA.id!);
      await deleteProductRow(productB.id!);
      await deleteCustomerRow(customer.id!);
    }
  });
});
