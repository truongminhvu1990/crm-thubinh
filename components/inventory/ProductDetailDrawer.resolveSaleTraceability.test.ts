import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { CustomerPurchase } from "@/types/purchase";

/**
 * Inventory -> Order -> Customer Traceability (Product Owner Authorization,
 * 2026-08-21) - coverage for resolveSaleTraceability(), the pure branch
 * logic backing the Inventory Drawer's sale-traceability fields. This repo
 * has no component-rendering test infrastructure (no @testing-library/
 * react/jsdom), so this is the meaningful testable unit, same convention
 * as BatchProductsTable.filter.test.ts's matchesFilter() coverage - full
 * render/click/link-href coverage would need Playwright.
 *
 * Case 4/5 (Lot link / no Lot) are plain conditional JSX on product.batch_id
 * reusing ProductInventory.tsx's own proven pattern verbatim, with no
 * branch logic of their own to extract - left to manual UAT, same as this
 * repo's other untestable-without-Playwright JSX branches.
 *
 * ProductDetailDrawer.tsx transitively imports getPurchaseForProduct ->
 * "@/lib/supabase", which creates a real Supabase client at module-eval
 * time and throws without project env vars configured (same pitfall
 * order.service.test.ts's own header documents) - mocked once, at file
 * scope; the module under test is then imported inside each test body via
 * `await import(...)`, matching this repo's established convention (e.g.
 * commission.service.void.test.ts) rather than a top-level await.
 */
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

function purchase(overrides: Partial<CustomerPurchase> = {}): CustomerPurchase {
  return {
    id: "purchase-1",
    customer_id: "customer-1",
    sale_price: 1000000,
    sale_date: "2026-08-20",
    salesperson: "Nguyen Van A",
    customer: { id: "customer-1", full_name: "Tran Thi Hoa", customer_code: "KH0001" },
    ...overrides,
  };
}

test("Case 6: never sold - null purchase resolves to no-sale", async () => {
  const { resolveSaleTraceability } = await import("./ProductDetailDrawer");
  assert.deepEqual(resolveSaleTraceability(null), { kind: "no-sale" });
});

test("Case 2: legacy direct sale - purchase with no order_item resolves to direct-sale", async () => {
  const { resolveSaleTraceability } = await import("./ProductDetailDrawer");
  const p = purchase({ order_item_id: null, order_item: undefined });
  const result = resolveSaleTraceability(p);
  assert.equal(result.kind, "direct-sale");
  assert.equal(result.kind === "direct-sale" && result.purchase, p);
});

test("Case 2b: order_item present but its own order is null resolves to direct-sale (never treated as missing)", async () => {
  const { resolveSaleTraceability } = await import("./ProductDetailDrawer");
  const p = purchase({ order_item_id: "item-1", order_item: { order: null } });
  const result = resolveSaleTraceability(p);
  assert.equal(result.kind, "direct-sale");
});

test("Case 1: Sold + active Order resolves to order-sale, not cancelled", async () => {
  const { resolveSaleTraceability } = await import("./ProductDetailDrawer");
  const p = purchase({
    order_item_id: "item-1",
    order_item: { order: { id: "order-1", order_number: "OD-20260815-000004", order_status: "Completed" } },
  });
  const result = resolveSaleTraceability(p);
  assert.equal(result.kind, "order-sale");
  if (result.kind === "order-sale") {
    assert.equal(result.orderId, "order-1");
    assert.equal(result.orderNumber, "OD-20260815-000004");
    assert.equal(result.isCancelled, false);
  }
});

test("Case 3: Cancelled Order - order remains linkable, isCancelled true (relationship never hidden)", async () => {
  const { resolveSaleTraceability } = await import("./ProductDetailDrawer");
  const p = purchase({
    order_item_id: "item-1",
    order_item: { order: { id: "order-2", order_number: "OD-20260820-000009", order_status: "Cancelled" } },
  });
  const result = resolveSaleTraceability(p);
  assert.equal(result.kind, "order-sale");
  if (result.kind === "order-sale") {
    assert.equal(result.orderId, "order-2");
    assert.equal(result.orderNumber, "OD-20260820-000009");
    assert.equal(result.isCancelled, true);
  }
});

test("Case 7 (permission, structural): 'no-sale' carries no purchase field - nothing to leak when visibility hides the row", async () => {
  const { resolveSaleTraceability } = await import("./ProductDetailDrawer");
  const result = resolveSaleTraceability(null);
  assert.equal(result.kind, "no-sale");
  assert.equal(Object.hasOwn(result, "purchase"), false);
});
