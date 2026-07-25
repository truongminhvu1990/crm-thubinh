import { test, expect } from "../shared/fixtures";
import { OrderPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  createTestCustomer,
  createTestProduct,
  getOrderByNumber,
  getOrderItemsByOrderId,
  getPaymentsByOrderId,
  getProductById,
  getCustomerPurchaseByOrderItemId,
  getSalesCommissionByPurchaseId,
  deleteOrderRow,
  deleteCustomerRow,
  deleteProductRow,
} from "../shared/utils";

/**
 * QA Wave 2 - Orders, GROUP 5: Business Verification.
 *
 * Walks the full Business Flow end to end in one continuous scenario -
 * Create Order -> Add Products -> Discount -> Payment -> Complete Order ->
 * Inventory -> Customer Purchases - checking every table's state at each
 * step, not just the final one. Groups 1-4 already isolate each step;
 * this is the one test that proves the *chain* holds together (e.g. that
 * the item created in step 2 is the exact item snapshotted in step 5, by
 * the same id, not just "an item exists somewhere").
 *
 * "Reports" (the last link in the Business Flow diagram) is verified at
 * the data level here, not by opening the Reports UI: `customer_purchases`
 * is the single source of truth every Reports/Sales Ledger/Dashboard query
 * reads from (confirmed throughout the Business Time Migration packages),
 * so confirming that row's product_id/sale_price/sale_date are exactly
 * correct *is* confirming Reports would compute the right numbers from it.
 * Actually opening /reports and asserting a specific revenue figure would
 * require assuming a Global Date Filter state and a company-wide revenue
 * baseline neither of which this package (Scope: Orders only) owns -
 * that belongs to Reports' own future Wave.
 */
test.describe("Orders - Business Verification (full chain)", () => {
  test("orders -> order_items -> payments -> customer_purchases -> products, one continuous scenario", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 2_000_000, discount: 0 });
    let orderId: string | undefined;

    try {
      // ---- Create Order ----
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoNew();
      await orders.searchCustomer(customer.phone);
      await orders.selectCustomerByName(customer.full_name);
      const salesOwner = await orders.selectFirstAvailableSalesOwner();

      // ---- Add Products ----
      await orders.searchProduct(product.product_code);
      await orders.addProductToCart(product.product_name);

      // ---- Discount ----
      await orders.setCartLineDiscount(product.product_name, 200_000);

      await orders.saveOrder();
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
      await waitForLoading(page);

      const orderNumber = (await page.getByRole("heading", { name: /^OD-/ }).textContent())!.trim();
      let dbOrder = (await getOrderByNumber(orderNumber))!;
      orderId = dbOrder.id;

      expect(dbOrder.customer_id).toBe(customer.id);
      expect(dbOrder.sales_owner).toBe(salesOwner);
      expect(dbOrder.order_status).toBe("Draft");
      expect(dbOrder.total_amount).toBe(1_800_000); // 2,000,000 - 200,000

      const items = await getOrderItemsByOrderId(orderId!);
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.line_total).toBe(1_800_000);

      const reservedProduct = await getProductById(product.id!);
      expect(reservedProduct!.status).toBe("Reserved");

      // ---- Payment (partial, deliberately less than total) ----
      await orders.openAddPaymentModal();
      await orders.fillPaymentAmount(800_000);
      await orders.selectFirstAvailablePaymentMethod();
      await orders.savePayment();
      await expect(orders.dialog()).toBeHidden();
      await waitForLoading(page);

      const payments = await getPaymentsByOrderId(orderId!);
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(800_000);

      dbOrder = (await getOrderByNumber(orderNumber))!;
      expect(dbOrder.payment_status).toBe("Partially Paid");

      // ---- Complete Order (ORDERS_SPEC.md §5: completing on partial
      // payment is normal business - "deposit sales... all normal") ----
      await orders.complete();
      await waitForLoading(page);

      dbOrder = (await getOrderByNumber(orderNumber))!;
      expect(dbOrder.order_status).toBe("Completed");
      expect(dbOrder.payment_status).toBe("Partially Paid"); // completion never touches payment_status

      // ---- Inventory ----
      const soldProduct = await getProductById(product.id!);
      expect(soldProduct!.status).toBe("Sold");

      // ---- Customer Purchases (the snapshot Reports/Sales Ledger/
      // Dashboard/Commission all read from) ----
      const purchase = await getCustomerPurchaseByOrderItemId(item.id!);
      expect(purchase).not.toBeNull();
      expect(purchase!.order_item_id).toBe(item.id);
      expect(purchase!.customer_id).toBe(customer.id);
      expect(purchase!.product_id).toBe(product.id);
      // sale_price is the item's own line_total (post-discount), not the
      // order's total_amount and not the product's raw sale_price -
      // Rule 4 of the Sales Snapshot Integration.
      expect(purchase!.sale_price).toBe(1_800_000);
      expect(purchase!.sale_date).toBe(dbOrder.order_date);
      expect(purchase!.salesperson).toBe(salesOwner);

      // ---- Reports' data source (commission snapshot, same row set
      // Reports' Staff Analysis / KPI Dashboard read) ----
      const commission = await getSalesCommissionByPurchaseId(purchase!.id!);
      expect(commission).not.toBeNull();
      expect(commission!.sale_amount).toBe(1_800_000);
      expect(commission!.customer_id).toBe(customer.id);
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  test("A Lost order releases its product and never produces a customer_purchases snapshot", async ({ page }) => {
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
      const dbOrder = (await getOrderByNumber(orderNumber))!;
      orderId = dbOrder.id;

      const items = await getOrderItemsByOrderId(orderId!);

      await orders.markOrderLost();
      await waitForLoading(page);

      const updatedOrder = await getOrderByNumber(orderNumber);
      expect(updatedOrder!.order_status).toBe("Lost");

      const releasedProduct = await getProductById(product.id!);
      expect(releasedProduct!.status).toBe("Active");

      const purchase = await getCustomerPurchaseByOrderItemId(items[0].id!);
      expect(purchase).toBeNull();
    } finally {
      if (orderId) await deleteOrderRow(orderId);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });
});
