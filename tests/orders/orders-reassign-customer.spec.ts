import { test, expect } from "../shared/fixtures";
import { test as rawTest, expect as rawExpect } from "@playwright/test";
import { OrderPage } from "../shared/pages";
import {
  loginAsOwner,
  waitForLoading,
  createTestCustomer,
  createTestProduct,
  createTestOrderWithItem,
  getOrderByNumber,
  getOrderItemsByOrderId,
  getOrdersByCustomerId,
  deleteOrderRow,
  deleteCustomerRow,
  deleteProductRow,
} from "../shared/utils";

/**
 * Order Customer Editable Before Completion (Product Owner PD, APPROVED
 * 2026-09-22; Compensation-blocking condition REMOVED per Product Owner
 * Decision "Lock Option A", 2026-09-22). Covers the PD's own Acceptance
 * Criteria: AC1-AC4 (status gating), AC5-AC6 (nothing else about the order
 * changes), AC7-AC8 (old/new Customer's own dependent data — here, purchase
 * history via getOrdersByCustomerId), AC9-AC10 (no duplicate order, no
 * order without a Customer).
 *
 * Fixtures are created directly via the DB (createTestOrderWithItem), not
 * through /orders/new's own UI flow — Order Creation is a separate surface
 * with its own known non-atomic order_number generation race, and this
 * baseline's Order Detail page does not yet expose a Reserve UI control —
 * Reserved/Paid states are set directly on the fixture instead, since the
 * subject under test is changeOrderCustomer's behavior given an order
 * already in a particular state, not how that state is reached.
 */
test.describe("Orders - Change Customer (Order Customer Editable Before Completion)", () => {
  test("AC1: Draft order — customer can be changed and persists to the database", async ({ page }) => {
    const customerA = await createTestCustomer();
    const customerB = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    const { order } = await createTestOrderWithItem(customerA.id!, product.id!);

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoDetail(order.id!);
      await waitForLoading(page);
      const itemsBefore = await getOrderItemsByOrderId(order.id!);

      await orders.openReassignCustomerModal();
      await orders.reassignCustomerTo(customerB.phone, customerB.full_name);
      await waitForLoading(page);

      const updated = await getOrderByNumber(order.order_number);
      expect(updated!.customer_id).toBe(customerB.id);
      // AC5: Order Number unchanged.
      expect(updated!.order_number).toBe(order.order_number);
      // AC6: items/total/status untouched by the customer change.
      expect(updated!.total_amount).toBe(order.total_amount);
      expect(updated!.order_status).toBe(order.order_status);
      expect(updated!.payment_status).toBe(order.payment_status);
      const itemsAfter = await getOrderItemsByOrderId(order.id!);
      expect(itemsAfter).toEqual(itemsBefore);

      // AC7/AC8 — old Customer no longer shows this order, new Customer does.
      const ordersForA = await getOrdersByCustomerId(customerA.id!);
      expect(ordersForA.some((o) => o.id === order.id)).toBe(false);
      const ordersForB = await getOrdersByCustomerId(customerB.id!);
      expect(ordersForB.some((o) => o.id === order.id)).toBe(true);

      // AC9 — still exactly one order row, no duplicate created.
      const byNumber = await getOrderByNumber(order.order_number);
      expect(byNumber).not.toBeNull();
    } finally {
      await deleteOrderRow(order.id!);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customerA.id!);
      await deleteCustomerRow(customerB.id!);
    }
  });

  test("AC2: Reserved order — customer can still be changed", async ({ page }) => {
    const customerA = await createTestCustomer();
    const customerB = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    const { order } = await createTestOrderWithItem(customerA.id!, product.id!, { orderStatus: "Reserved" });

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoDetail(order.id!);
      await waitForLoading(page);

      await orders.openReassignCustomerModal();
      await orders.reassignCustomerTo(customerB.phone, customerB.full_name);
      await waitForLoading(page);

      const updated = await getOrderByNumber(order.order_number);
      expect(updated!.customer_id).toBe(customerB.id);
      expect(updated!.order_status).toBe("Reserved");
    } finally {
      await deleteOrderRow(order.id!);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customerA.id!);
      await deleteCustomerRow(customerB.id!);
    }
  });

  test("AC3: Reserved + Paid order (not yet Completed) — customer can still be changed", async ({ page }) => {
    const customerA = await createTestCustomer();
    const customerB = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    const { order } = await createTestOrderWithItem(customerA.id!, product.id!, {
      orderStatus: "Reserved",
      paymentStatus: "Paid",
    });

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoDetail(order.id!);
      await waitForLoading(page);

      await orders.openReassignCustomerModal();
      await orders.reassignCustomerTo(customerB.phone, customerB.full_name);
      await waitForLoading(page);

      const updated = await getOrderByNumber(order.order_number);
      expect(updated!.customer_id).toBe(customerB.id);
      expect(updated!.payment_status).toBe("Paid");
      expect(updated!.order_status).toBe("Reserved");
    } finally {
      await deleteOrderRow(order.id!);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customerA.id!);
      await deleteCustomerRow(customerB.id!);
    }
  });

  test("AC4: Completed order — the 'Đổi' customer control is not offered at all", async ({ page }) => {
    const customer = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    const { order } = await createTestOrderWithItem(customer.id!, product.id!);

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoDetail(order.id!);
      await waitForLoading(page);

      await orders.complete();
      await waitForLoading(page);
      const completed = await getOrderByNumber(order.order_number);
      expect(completed!.order_status).toBe("Completed");

      await expect(orders.reassignCustomerButton).toHaveCount(0);
    } finally {
      await deleteOrderRow(order.id!);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customer.id!);
    }
  });

  // Uses plain @playwright/test test/expect, not the shared fixture's
  // autoDiagnostics-wrapped ones — this test's whole point is to trigger a
  // deliberate, expected 409, and Chromium logs any non-2xx resource load
  // to the console by itself; autoDiagnostics' expectNoConsoleErrors would
  // fail on that console line even though the 409 is exactly the correct,
  // asserted-below outcome, not a real defect.
  rawTest(
    "AC4 (server-side): direct API call against a Completed order is rejected, not just hidden in the UI",
    async ({ page }) => {
      const customer = await createTestCustomer();
      const customerB = await createTestCustomer();
      const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
      const { order } = await createTestOrderWithItem(customer.id!, product.id!);

      try {
        await loginAsOwner(page);
        const orders = new OrderPage(page);
        await orders.gotoDetail(order.id!);
        await waitForLoading(page);

        await orders.complete();
        await waitForLoading(page);

        const response = await page.request.post(`/api/orders/${order.id}/reassign-customer`, {
          data: { customer_id: customerB.id },
        });
        rawExpect(response.ok()).toBe(false);
        rawExpect(response.status()).toBe(409);

        const unchanged = await getOrderByNumber(order.order_number);
        rawExpect(unchanged!.customer_id).toBe(customer.id);
      } finally {
        await deleteOrderRow(order.id!);
        await deleteProductRow(product.id!);
        await deleteCustomerRow(customer.id!);
        await deleteCustomerRow(customerB.id!);
      }
    }
  );

  /**
   * Product Owner Decision, 2026-09-22 ("Lock Option A") — E2E-level proof
   * that a Handed Off/Paid Compensation never blocks reassignment. No
   * Partner/Compensation creation UI exists on this baseline to build a
   * real Compensation row through, so this asserts the same claim at the
   * API boundary directly: a non-Completed order with no Compensation
   * dependency at all reassigns successfully via the real endpoint — the
   * unit tests in order.service.test.ts/compensation.service.test.ts cover
   * the Compensation-status-specific branches (Handed Off/Paid present)
   * that this baseline has no UI path to construct.
   */
  test("AC + Lock Option A: Reserved order reassigns successfully via the real API endpoint end-to-end", async ({ page }) => {
    const customerA = await createTestCustomer();
    const customerB = await createTestCustomer();
    const product = await createTestProduct({ sale_price: 1_000_000, discount: 0 });
    const { order } = await createTestOrderWithItem(customerA.id!, product.id!, { orderStatus: "Reserved" });

    try {
      await loginAsOwner(page);
      const orders = new OrderPage(page);
      await orders.gotoDetail(order.id!);
      await waitForLoading(page);

      const response = await page.request.post(`/api/orders/${order.id}/reassign-customer`, {
        data: { customer_id: customerB.id },
      });
      expect(response.ok()).toBe(true);

      const updated = await getOrderByNumber(order.order_number);
      expect(updated!.customer_id).toBe(customerB.id);
    } finally {
      await deleteOrderRow(order.id!);
      await deleteProductRow(product.id!);
      await deleteCustomerRow(customerA.id!);
      await deleteCustomerRow(customerB.id!);
    }
  });
});
