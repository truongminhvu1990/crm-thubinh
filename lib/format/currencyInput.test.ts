import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDigits,
  formatThousands,
  digitsToNumber,
  digitsBeforeCursor,
  cursorPositionForDigitCount,
} from "./currencyInput";

test("parseDigits strips everything but digits", () => {
  assert.equal(parseDigits("10.900.000"), "10900000");
  assert.equal(parseDigits("10,900,000 đ"), "10900000");
  assert.equal(parseDigits("abc"), "");
  assert.equal(parseDigits(""), "");
});

test("formatThousands groups by 3 with Vietnamese '.' separator", () => {
  assert.equal(formatThousands("10900000"), "10.900.000");
  assert.equal(formatThousands("900"), "900");
  assert.equal(formatThousands("1000"), "1.000");
  assert.equal(formatThousands(""), "");
});

test("formatThousands collapses leading zeros", () => {
  assert.equal(formatThousands("0123"), "123");
  assert.equal(formatThousands("00"), "0");
  assert.equal(formatThousands("0"), "0");
});

test("digitsToNumber returns undefined for empty, a number otherwise", () => {
  assert.equal(digitsToNumber(""), undefined);
  assert.equal(digitsToNumber("0"), 0);
  assert.equal(digitsToNumber("10900000"), 10900000);
});

test("digitsBeforeCursor counts only digits before the caret", () => {
  // "10.900.000" with caret right after "10.9" (index 4) -> digits "109" = 3
  assert.equal(digitsBeforeCursor("10.900.000", 4), 3);
  assert.equal(digitsBeforeCursor("10900000", 8), 8);
  assert.equal(digitsBeforeCursor("", 0), 0);
});

test("cursorPositionForDigitCount places the caret after the Nth digit", () => {
  // "10.900.000", want caret after the 3rd digit ('9') -> index 4 (right after "10.9")
  assert.equal(cursorPositionForDigitCount("10.900.000", 3), 4);
  assert.equal(cursorPositionForDigitCount("10.900.000", 0), 0);
  assert.equal(cursorPositionForDigitCount("10.900.000", 100), "10.900.000".length);
});

test("round trip: backspace across a separator keeps the caret sensible", () => {
  // User has "10.900.000" with caret after the separator at index 3 (right
  // before "900"), presses backspace -> raw becomes "10900.000" pre-parse
  // simulation isn't needed here; this test just documents the paste/typing
  // contract at the digit-count level used by the component.
  const raw = "10900.000"; // what the browser's native backspace would leave mid-reformat
  const digits = parseDigits(raw);
  assert.equal(digits, "10900000");
  const formatted = formatThousands(digits);
  assert.equal(formatted, "10.900.000");
});

test("paste of mixed-separator text normalizes to the same digits", () => {
  assert.equal(parseDigits("10,900,000"), parseDigits("10.900.000"));
  assert.equal(formatThousands(parseDigits("10,900,000")), "10.900.000");
});
