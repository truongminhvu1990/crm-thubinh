import test from "node:test";
import assert from "node:assert/strict";
import { validateChangeOrderCustomerInput } from "./order.validation";

/** Order Customer Editable Before Completion PD (APPROVED 2026-09-22) —
 * structural check only (customer_id present); the status-gate and
 * new-customer-exists check are I/O-bearing, covered in
 * order.service.test.ts's changeOrderCustomer tests instead. */

test("validateChangeOrderCustomerInput: missing customer_id is rejected", () => {
  const error = validateChangeOrderCustomerInput({ customer_id: "" });
  assert.ok(error);
});

test("validateChangeOrderCustomerInput: a present customer_id passes structural validation", () => {
  const error = validateChangeOrderCustomerInput({ customer_id: "customer-2" });
  assert.equal(error, null);
});
