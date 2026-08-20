import test from "node:test";
import assert from "node:assert/strict";
import {
  canCancelOrder,
  validateCancelOrderTransition,
  validateCancelOrderInput,
  isValidOrderStatusTransition,
} from "./order.rules";

/**
 * D12 Order Cancellation — pure rule tests (no I/O, no mocking needed).
 * Covers Test 3 (no items), Test 4 (multi-product coverage), Test 5
 * (Cancelled -> Cancel again), Test 6 (Draft/Reserved -> Cancel reject).
 */

test("Test 6: canCancelOrder — only Completed is cancellable", () => {
  assert.equal(canCancelOrder("Completed"), true);
  assert.equal(canCancelOrder("Draft"), false);
  assert.equal(canCancelOrder("Reserved"), false);
  assert.equal(canCancelOrder("Lost"), false);
  assert.equal(canCancelOrder("Cancelled"), false);
});

test("Test 5: Cancelled -> Cancelled is not a valid transition (cannot cancel twice)", () => {
  assert.equal(isValidOrderStatusTransition("Cancelled", "Cancelled"), false);
});

test("validateCancelOrderTransition: clear message for a non-Completed order", () => {
  assert.equal(validateCancelOrderTransition("Completed"), null);
  assert.notEqual(validateCancelOrderTransition("Draft"), null);
  assert.notEqual(validateCancelOrderTransition("Cancelled"), null);
});

test("Test 4: validateCancelOrderInput — multi-product, mixed disposition, full coverage is valid", () => {
  const items = [{ id: "item-A" }, { id: "item-B" }, { id: "item-C" }];
  const error = validateCancelOrderInput(
    {
      dispositions: [
        { order_item_id: "item-A", disposition: "Remaining" as const },
        { order_item_id: "item-B", disposition: "Returned" as const },
        { order_item_id: "item-C", disposition: "Remaining" as const },
      ],
    },
    items
  );
  assert.equal(error, null);
});

test("Test 4: validateCancelOrderInput — missing disposition for one of several items is rejected", () => {
  const items = [{ id: "item-A" }, { id: "item-B" }];
  const error = validateCancelOrderInput(
    { dispositions: [{ order_item_id: "item-A", disposition: "Remaining" as const }] },
    items
  );
  assert.notEqual(error, null);
});

test("Test 3: validateCancelOrderInput — no items, no dispositions required, valid", () => {
  const error = validateCancelOrderInput({ dispositions: [] }, []);
  assert.equal(error, null);
});

test("validateCancelOrderInput — disposition for an order_item not in this order is rejected", () => {
  const items = [{ id: "item-A" }];
  const error = validateCancelOrderInput(
    { dispositions: [{ order_item_id: "item-A", disposition: "Remaining" as const }, { order_item_id: "item-not-in-order", disposition: "Returned" as const }] },
    items
  );
  assert.notEqual(error, null);
});

test("validateCancelOrderInput — duplicate disposition for the same item is rejected", () => {
  const items = [{ id: "item-A" }];
  const error = validateCancelOrderInput(
    {
      dispositions: [
        { order_item_id: "item-A", disposition: "Remaining" as const },
        { order_item_id: "item-A", disposition: "Returned" as const },
      ],
    },
    items
  );
  assert.notEqual(error, null);
});
