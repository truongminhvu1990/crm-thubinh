import test from "node:test";
import assert from "node:assert/strict";
import { matchesFilter } from "./BatchProductsTable";
import { Product } from "@/types/product";

/**
 * BR-003 Final Blocker Fix, follow-up (Product Owner Authorization,
 * 2026-08-21) — matchesFilter()'s "returned"/"remaining" cases must key on
 * returned_at IS NOT NULL, never on the retired status === "Returned"
 * literal, matching the exact invariant already fixed in
 * computeBatchCounts() (productBatch.service.ts) and
 * getBatchStaticReportData() (reports.service.ts).
 *
 * Separate, new file from the pre-existing BatchProductsTable.filter.test.ts
 * (out of this task's authorized scope) - that file's own fixtures
 * construct products via a literal status string only, with no
 * returned_at, and its "returned"/"remaining" assertions now fail against
 * the corrected semantics; flagged separately, not modified here.
 */
function product(overrides: Partial<Product> = {}): Product {
  return { product_code: "P1", product_name: "Test", status: "Available", ...overrides };
}

test("BR-003: 'returned' filter finds an Archived product WITH returned_at set", () => {
  const p = product({ status: "Archived", returned_at: "2026-08-15T00:00:00Z" });
  assert.equal(matchesFilter(p, "returned"), true);
});

test("BR-003: 'returned' filter excludes an Archived product with returned_at NULL", () => {
  const p = product({ status: "Archived", returned_at: null });
  assert.equal(matchesFilter(p, "returned"), false);
});

test("BR-003: 'returned' filter excludes any non-returned status regardless of the (retired) 'Returned' string", () => {
  for (const status of ["Available", "Reserved", "Sold", "Paused", "Discontinued"]) {
    assert.equal(matchesFilter(product({ status, returned_at: null }), "returned"), false, status);
  }
});

test("BR-003: 'remaining' filter agrees with computeBatchCounts()'s invariant — excludes Sold and actually-returned products only", () => {
  const cases: [Partial<Product>, boolean][] = [
    [{ status: "Available", returned_at: null }, true],
    [{ status: "Reserved", returned_at: null }, true],
    [{ status: "Paused", returned_at: null }, true],
    [{ status: "Discontinued", returned_at: null }, true],
    [{ status: "Sold", returned_at: null }, false],
    [{ status: "Archived", returned_at: "2026-08-15T00:00:00Z" }, false],
    // The exact BR-003 guard: Archived alone, with no returned_at, is NOT Returned - still Remaining.
    [{ status: "Archived", returned_at: null }, true],
  ];
  for (const [overrides, expected] of cases) {
    assert.equal(matchesFilter(product(overrides), "remaining"), expected, JSON.stringify(overrides));
  }
});

test("BR-003: existing Available/Reserved/Sold filter behavior remains correct", () => {
  assert.equal(matchesFilter(product({ status: "Reserved" }), "reserved"), true);
  assert.equal(matchesFilter(product({ status: "Available" }), "reserved"), false);
  assert.equal(matchesFilter(product({ status: "Sold" }), "sold"), true);
  assert.equal(matchesFilter(product({ status: "Available" }), "sold"), false);
  assert.equal(matchesFilter(product({ status: "Available" }), "all"), true);
});
