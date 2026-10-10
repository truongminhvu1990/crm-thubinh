import test from "node:test";
import assert from "node:assert/strict";
import { DRILLDOWN_FILTER_KEYS, parseSalesLedgerDrilldownParams } from "./drilldownParams";

// The four additive Sales Ledger drill-down filters are whitelisted: fixed meaning, strict value shape, nothing else gets through.

const parse = (q: string) => parseSalesLedgerDrilldownParams(new URLSearchParams(q));
const UUID = "0b9e1c2a-1111-4222-8333-444455556666";

test("no drill-down parameter -> no filter at all (existing callers are unaffected)", () => {
  assert.deepEqual(parse(""), { filters: {} });
  assert.deepEqual(parse("dateFrom=2026-09-01&dateTo=2026-10-01&productCategory=V%C3%B2ng&minAmount=5000000&maxAmount=9000000"), { filters: {} });
});

test("productId must be a UUID; anything else is rejected, never passed on", () => {
  assert.deepEqual(parse(`productId=${UUID}`), { filters: { productId: UUID } });
  assert.deepEqual(parse(`productId=${UUID.toUpperCase()}`), { filters: { productId: UUID.toUpperCase() } });
  for (const bad of ["1", "abc", `${UUID}x`, "' or 1=1 --", `${UUID},product_code.ilike.%`, "*", "product_id.eq.1"]) {
    assert.ok("error" in parse(`productId=${encodeURIComponent(bad)}`), bad);
  }
  assert.deepEqual(parse("productId="), { filters: {} }, "an empty value means 'not set'");
});

test("maxAmountExclusive must be a finite number >= 0", () => {
  assert.deepEqual(parse("maxAmountExclusive=5000000"), { filters: { maxAmountExclusive: 5_000_000 } });
  assert.deepEqual(parse("maxAmountExclusive=0"), { filters: { maxAmountExclusive: 0 } });
  assert.deepEqual(parse("maxAmountExclusive=5e6"), { filters: { maxAmountExclusive: 5_000_000 } });
  for (const bad of ["", " ", "abc", "-1", "NaN", "Infinity", "1;drop table", "5000000,sale_amount.gt.0"]) {
    assert.ok("error" in parse(`maxAmountExclusive=${encodeURIComponent(bad)}`), JSON.stringify(bad));
  }
});

test("the two boolean flags switch on ONLY for 1 / true; any other value leaves them off", () => {
  assert.deepEqual(parse("uncategorized=1&recognizedOnly=true"), { filters: { uncategorized: true, recognizedOnly: true } });
  for (const off of ["0", "false", "yes", "TRUE", "on", "", "1;2"]) {
    assert.deepEqual(parse(`uncategorized=${encodeURIComponent(off)}&recognizedOnly=${encodeURIComponent(off)}`), { filters: {} }, off);
  }
});

test("only the four whitelisted keys are ever produced - unknown parameters, field names and operators are ignored", () => {
  const r = parse(`productId=${UUID}&uncategorized=1&maxAmountExclusive=10&recognizedOnly=1&select=*&order=sale_amount&sale_amount=gt.0&or=(a.eq.1)&is_revenue_recognized=eq.false`);
  assert.ok("filters" in r);
  assert.deepEqual(Object.keys((r as { filters: object }).filters).sort(), [...DRILLDOWN_FILTER_KEYS].sort());
});
