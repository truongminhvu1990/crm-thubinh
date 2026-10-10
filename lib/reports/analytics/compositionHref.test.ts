import test from "node:test";
import assert from "node:assert/strict";
import { categoryLedgerHref, inventoryCategoryHref, priceBandLedgerHref, productLedgerHref } from "./compositionHref";
import { NO_PRICE_BAND, PRICE_BANDS } from "./composition";

// Dashboard Wave B drill-down URLs: exact filters, whitelisted parameter names, the Dashboard's own date range, no unsafe concatenation.

const RANGE = { start: "2026-09-01", end: "2026-10-01" };
const q = (href: string | null) => new URL(href!, "http://x").searchParams;
const path = (href: string | null) => new URL(href!, "http://x").pathname;

test("F4 product: Sales Ledger, exact productId, the Dashboard date range (end exclusive), recognized rows only", () => {
  const href = productLedgerHref("0b9e1c2a-1111-4222-8333-444455556666", RANGE);
  assert.equal(path(href), "/reports/sales-ledger");
  assert.equal(q(href).get("productId"), "0b9e1c2a-1111-4222-8333-444455556666");
  assert.equal(q(href).get("dateFrom"), "2026-09-01");
  assert.equal(q(href).get("dateTo"), "2026-10-01");
  assert.equal(q(href).get("recognizedOnly"), "1");
  assert.equal(q(href).get("productCode"), null, "the product is matched exactly by id, not by a code substring");
});

test("F4: an unknown product has no exact filter, so it has no link", () => {
  assert.equal(productLedgerHref(null, RANGE), null);
});

test("an all-time Dashboard sends no date range (the ledger then follows its own period, as before)", () => {
  for (const href of [productLedgerHref("0b9e1c2a-1111-4222-8333-444455556666", null), categoryLedgerHref("Vòng", null), priceBandLedgerHref(PRICE_BANDS[1], null)]) {
    assert.equal(q(href).get("dateFrom"), null);
    assert.equal(q(href).get("dateTo"), null);
    assert.equal(q(href).get("recognizedOnly"), "1");
  }
});

test("F5 category: the exact category value (encoded), or uncategorized=1 for 'Chưa phân loại' - never the display label", () => {
  const vong = categoryLedgerHref("Vòng", RANGE);
  assert.equal(q(vong).get("productCategory"), "Vòng");
  assert.equal(q(vong).get("uncategorized"), null);
  assert.ok(vong.includes("V%C3%B2ng"), "percent-encoded");
  const none = categoryLedgerHref(null, RANGE);
  assert.equal(q(none).get("uncategorized"), "1");
  assert.equal(q(none).get("productCategory"), null);
  // a hostile category value stays one inert, encoded parameter value
  const hostile = categoryLedgerHref("a&maxAmountExclusive=1&productId=x#", RANGE);
  assert.equal(q(hostile).get("productCategory"), "a&maxAmountExclusive=1&productId=x#");
  assert.equal(q(hostile).get("maxAmountExclusive"), null);
  assert.equal(q(hostile).get("productId"), null);
});

test("F8 price band: [min, maxExclusive) as minAmount (inclusive) and maxAmountExclusive - every boundary from the locked bands", () => {
  const expected: Record<string, [string | null, string | null]> = {
    under5m: [null, "5000000"],
    "5to10m": ["5000000", "10000000"],
    "10to20m": ["10000000", "20000000"],
    "20to50m": ["20000000", "50000000"],
    "50to100m": ["50000000", "100000000"],
    from100m: ["100000000", null],
  };
  for (const b of PRICE_BANDS) {
    const href = priceBandLedgerHref(b, RANGE);
    assert.equal(q(href).get("minAmount"), expected[b.key][0], b.key);
    assert.equal(q(href).get("maxAmountExclusive"), expected[b.key][1], b.key);
    assert.equal(q(href).get("maxAmount"), null, "the inclusive maxAmount is never used for a band");
    assert.equal(q(href).get("recognizedOnly"), "1");
    assert.equal(q(href).get("dateFrom"), "2026-09-01");
  }
});

test("F8: 'Không có giá' has no exact ledger filter, so it has no link", () => {
  assert.equal(priceBandLedgerHref(NO_PRICE_BAND, RANGE), null);
});

test("F9: the Inventory report with the exact view and category - and never a date (inventory is current)", () => {
  for (const view of ["held", "remaining"] as const) {
    const href = inventoryCategoryHref(view, "Vòng");
    assert.equal(path(href), "/reports/inventory");
    assert.equal(q(href).get("view"), view);
    assert.equal(q(href).get("category"), "Vòng");
    assert.equal(q(href).get("dateFrom"), null);
    assert.equal(q(href).get("start"), null);
    const none = inventoryCategoryHref(view, null);
    assert.equal(q(none).get("uncategorized"), "1");
    assert.equal(q(none).get("category"), null);
  }
});
