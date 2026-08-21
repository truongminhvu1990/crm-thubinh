import test from "node:test";
import assert from "node:assert/strict";
import { canReturnToSupplier } from "./BatchProductsTable";

/**
 * BR-003 Final Blocker Fix (Product Owner Authorization, 2026-08-21) —
 * Blocker 1: Return-to-Supplier eligibility must key on the current
 * canonical "Available" status, not the retired "Active" literal.
 *
 * canReturnToSupplier() is exported specifically for this test, same
 * reasoning as this file's own matchesFilter() - no component-rendering
 * test infrastructure in this repo.
 */

test("BR-003 Blocker 1: an Available product is eligible for Return-to-Supplier", () => {
  assert.equal(canReturnToSupplier("Available"), true);
});

test("BR-003 Blocker 1: a Paused product remains eligible (guard semantics unchanged)", () => {
  assert.equal(canReturnToSupplier("Paused"), true);
});

test("BR-003 Blocker 1: the retired 'Active' literal is no longer required/matched", () => {
  assert.equal(canReturnToSupplier("Active"), false);
});

test("BR-003 Blocker 1: Reserved/Sold/Archived/Discontinued are not eligible", () => {
  for (const status of ["Reserved", "Sold", "Archived", "Discontinued"]) {
    assert.equal(canReturnToSupplier(status), false, status);
  }
});
