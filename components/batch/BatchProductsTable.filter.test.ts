import test from "node:test";
import assert from "node:assert/strict";
import { matchesFilter, StatusFilter } from "./BatchProductsTable";
import { Product } from "@/types/product";

/**
 * Lot Product-Level Status, D1-D10 Test Plan — Case 8: Lot Detail filters
 * (Tất cả/Đang giữ đơn/Đã bán/Đã trả NCC/Còn lại) must select the correct
 * subset, and "Còn lại" must include Reserved products (Decision 6, LOCKED
 * — must not disagree with getBatchStats'/getBatchStaticReportData's
 * remaining = total - sold - returned formula).
 *
 * Status literals updated for BR-003 (LOCKED, 2026-08-21): "Active" is
 * retired in favor of "Available"; "Returned" is retired as a status
 * value entirely - a product returned to supplier is represented by
 * status "Archived" + a non-null returned_at, matching
 * computeBatchCounts()'s/getBatchStaticReportData()'s own invariant. A
 * plain Archived product (no returned_at) is a distinct, separately
 * covered case - Archived alone never means Returned.
 *
 * matchesFilter() is exported specifically for this test - this repo has
 * no component-rendering test infrastructure (no @testing-library/react /
 * jsdom in devDependencies), so this is the meaningful, testable unit of
 * the filter behavior; full render/click coverage would need Playwright.
 */
function product(status: string, returnedAt: string | null = null): Product {
  return { product_code: "P1", product_name: "Test", status, returned_at: returnedAt };
}

// Every plain (non-returned) status a product can hold today.
const plainStatuses = ["Available", "Paused", "Discontinued", "Reserved", "Sold", "Archived"];
// The one returned-to-supplier case: Archived + a real returned_at.
const RETURNED_AT = "2026-08-15T00:00:00Z";

test("Case 8: 'all' matches every status", () => {
  for (const s of plainStatuses) assert.equal(matchesFilter(product(s), "all"), true, s);
  assert.equal(matchesFilter(product("Archived", RETURNED_AT), "all"), true);
});

test("Case 8: 'reserved' matches only Reserved", () => {
  for (const s of plainStatuses) {
    assert.equal(matchesFilter(product(s), "reserved"), s === "Reserved", s);
  }
});

test("Case 8: 'sold' matches only Sold", () => {
  for (const s of plainStatuses) {
    assert.equal(matchesFilter(product(s), "sold"), s === "Sold", s);
  }
});

test("Case 8 (BR-003): 'returned' matches only Archived + returned_at set, never a plain status", () => {
  for (const s of plainStatuses) {
    assert.equal(matchesFilter(product(s), "returned"), false, s);
  }
  assert.equal(matchesFilter(product("Archived", RETURNED_AT), "returned"), true);
});

test("Case 8/Decision 6 (BR-003): 'remaining' matches everything except Sold and actually-returned - includes Reserved and plain Archived", () => {
  const expected: Record<string, boolean> = {
    Available: true,
    Paused: true,
    Discontinued: true,
    Reserved: true, // Decision 6, LOCKED: Reserved is a sub-count of Remaining
    Sold: false,
    Archived: true, // BR-003: Archived alone (no returned_at) is NOT Returned - still Remaining
  };
  for (const s of plainStatuses) {
    assert.equal(matchesFilter(product(s), "remaining" as StatusFilter), expected[s], s);
  }
  assert.equal(
    matchesFilter(product("Archived", RETURNED_AT), "remaining"),
    false,
    "Archived + returned_at must be excluded from Remaining"
  );
});
