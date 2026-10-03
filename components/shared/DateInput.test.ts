import test from "node:test";
import assert from "node:assert/strict";
import { dmyToIso, isoToDmy } from "./DateInput";

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
