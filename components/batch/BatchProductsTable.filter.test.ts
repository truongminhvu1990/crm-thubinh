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
 * matchesFilter() is exported specifically for this test - this repo has
 * no component-rendering test infrastructure (no @testing-library/react /
 * jsdom in devDependencies), so this is the meaningful, testable unit of
 * the filter behavior; full render/click coverage would need Playwright.
 */
function product(status: string): Product {
  return { product_code: "P1", product_name: "Test", status };
}

const statuses = ["Active", "Paused", "Discontinued", "Reserved", "Sold", "Returned"];

test("Case 8: 'all' matches every status", () => {
  for (const s of statuses) assert.equal(matchesFilter(product(s), "all"), true, s);
});

test("Case 8: 'reserved' matches only Reserved", () => {
  for (const s of statuses) {
    assert.equal(matchesFilter(product(s), "reserved"), s === "Reserved", s);
  }
});

test("Case 8: 'sold' matches only Sold", () => {
  for (const s of statuses) {
    assert.equal(matchesFilter(product(s), "sold"), s === "Sold", s);
  }
});

test("Case 8: 'returned' matches only Returned", () => {
  for (const s of statuses) {
    assert.equal(matchesFilter(product(s), "returned"), s === "Returned", s);
  }
});

test("Case 8/Decision 6: 'remaining' matches everything except Sold/Returned - includes Reserved", () => {
  const expected: Record<string, boolean> = {
    Active: true,
    Paused: true,
    Discontinued: true,
    Reserved: true, // Decision 6, LOCKED: Reserved is a sub-count of Remaining
    Sold: false,
    Returned: false,
  };
  for (const s of statuses) {
    assert.equal(matchesFilter(product(s), "remaining" as StatusFilter), expected[s], s);
  }
});
