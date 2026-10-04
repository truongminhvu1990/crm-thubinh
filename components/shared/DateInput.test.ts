import test from "node:test";
import assert from "node:assert/strict";
import { dmyToIso, isoToDmy, maskDmy } from "./DateInput";

test("display is dd/mm/yyyy, value stays ISO", () => {
  assert.equal(isoToDmy("2026-10-03"), "03/10/2026");
  assert.equal(isoToDmy(""), "");
  assert.equal(dmyToIso("03/10/2026"), "2026-10-03");
});

test("rejects impossible dates and wrong shapes (never silently swaps day/month)", () => {
  assert.equal(dmyToIso("31/02/2026"), null);
  assert.equal(dmyToIso("00/10/2026"), null);
  assert.equal(dmyToIso("2026-10-03"), null);
  assert.equal(dmyToIso("3/10/2026"), null);
  assert.equal(dmyToIso("10/13/2026"), null);
});

test("leap days: 29/02 is valid only in leap years (century rule included)", () => {
  assert.equal(dmyToIso("29/02/2028"), "2028-02-29");
  assert.equal(dmyToIso("29/02/2027"), null);
  assert.equal(dmyToIso("29/02/2100"), null);
  assert.equal(dmyToIso("29/02/2000"), "2000-02-29");
});

test("month and year boundaries round-trip", () => {
  for (const iso of ["2026-01-01", "2026-01-31", "2026-02-28", "2026-12-31", "2027-01-01"]) {
    assert.equal(dmyToIso(isoToDmy(iso)), iso);
  }
});

test("mask inserts the slashes while typing and ignores non-digits", () => {
  assert.equal(maskDmy("0"), "0");
  assert.equal(maskDmy("031"), "03/1");
  assert.equal(maskDmy("03102026"), "03/10/2026");
  assert.equal(maskDmy("03/10/2026999"), "03/10/2026");
  assert.equal(maskDmy("ab03-10"), "03/10");
  assert.equal(maskDmy(""), "");
});
