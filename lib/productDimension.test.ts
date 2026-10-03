import test from "node:test";
import assert from "node:assert/strict";
import {
  dimensionLabelFor,
  formatNiChotDay,
  formatProductDimension,
  isDimensionCategory,
  isDimensionRequired,
  parseNiChotDay,
  validateProductDimension,
  DIMENSION_REQUIRED_ERROR,
} from "./productDimension";

/** Ni-Chột-Dày shared parser/formatter/validator (PO spec 2026-10-04). */

const VALID: [string, [number, number, number]][] = [
  ["54-10-10", [54, 10, 10]],
  ["54.5-9.4-6.6", [54.5, 9.4, 6.6]],
  ["55-5.1-5.2", [55, 5.1, 5.2]],
  ["54.5-9-6", [54.5, 9, 6]],
];

for (const [input, [ni, chot, day]] of VALID) {
  test(`parseNiChotDay accepts ${input}`, () => {
    const r = parseNiChotDay(input);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, { ni, chot, day });
  });
}

const INVALID = [
  "54.5-9", // two components
  "54.5", // one component
  "54.5--6", // empty component
  "54.5-9-6-1", // four components
  "a-b-c",
  "1e3-9-6", // scientific notation
  "-1-9-6", // leading "-" => empty first component / negative
  "54.55-9-6", // 2 decimals
  "54.5-9.42-6",
  "54.5-9-6.123",
  "54,5-9-6", // comma decimal is NOT silently converted
  "54.5-9.-6", // malformed decimal
  ".5-9-6",
  "54.5 - 9 - 6", // inner whitespace
  "+54-9-6",
  "",
  "   ",
  "54.5-9-",
  "-",
  "--",
  "54.5-9-6\n1",
];

for (const input of INVALID) {
  test(`parseNiChotDay rejects ${JSON.stringify(input)}`, () => {
    assert.equal(parseNiChotDay(input).ok, false);
  });
}

test("parseNiChotDay trims surrounding whitespace only", () => {
  const r = parseNiChotDay("  54.5-9.4-6.6\t");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, { ni: 54.5, chot: 9.4, day: 6.6 });
});

test("parseNiChotDay accepts zero (no zero restriction was approved)", () => {
  assert.equal(parseNiChotDay("0-0-0").ok, true);
});

test("parseNiChotDay rejects a component that overflows to Infinity", () => {
  assert.equal(parseNiChotDay(`${"9".repeat(400)}-9-6`).ok, false);
});

test("formatNiChotDay prints integers without .0 and keeps one decimal", () => {
  assert.equal(formatNiChotDay(54, 10, 10), "54-10-10");
  assert.equal(formatNiChotDay(54.5, 9.4, 6.6), "54.5-9.4-6.6");
  assert.equal(formatNiChotDay(54.5, 9.0, 6), "54.5-9-6");
});

test("formatNiChotDay is null unless all three are present", () => {
  assert.equal(formatNiChotDay(54.5, 9.4, null), null);
  assert.equal(formatNiChotDay(undefined, 9.4, 6.6), null);
  assert.equal(formatNiChotDay(null, null, null), null);
});

test("parse -> format round-trips the canonical string", () => {
  for (const [input] of VALID) {
    const r = parseNiChotDay(input);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(formatNiChotDay(r.value.ni, r.value.chot, r.value.day), input);
  }
  // "9.0" is accepted but not preserved (trailing zero is not meaningful).
  const r = parseNiChotDay("54.5-9.0-6.0");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(formatNiChotDay(r.value.ni, r.value.chot, r.value.day), "54.5-9-6");
});

test("formatProductDimension reads the three numeric fields only (never products.size)", () => {
  assert.equal(
    formatProductDimension({ size: 17.5, dimension_ni_mm: 54.5, dimension_chot_mm: 9.4, dimension_day_mm: 6.6 }),
    "54.5-9.4-6.6"
  );
  assert.equal(formatProductDimension({ size: 17.5 }), null);
});

test("category scope: exactly Vòng and Nhẫn", () => {
  assert.equal(isDimensionCategory("Vòng"), true);
  assert.equal(isDimensionCategory("Nhẫn"), true);
  for (const c of ["Chuỗi", "Điêu khắc", "Bông tai", "Trang sức", "Phí vận chuyển", "Phí gia công", "Phí kiểm định", "Bracelet", "Ring", "Vòng tay", "vòng", "", null, undefined]) {
    assert.equal(isDimensionCategory(c as string | null | undefined), false, `category ${String(c)}`);
  }
  assert.equal(isDimensionCategory("toString"), false);
});

test("labels: Ni tay for Vòng, Ni nhẫn for Nhẫn, none otherwise", () => {
  assert.equal(dimensionLabelFor("Vòng"), "Ni tay-Chột-Dày (mm)");
  assert.equal(dimensionLabelFor("Nhẫn"), "Ni nhẫn-Chột-Dày (mm)");
  assert.equal(dimensionLabelFor("Chuỗi"), null);
  assert.equal(dimensionLabelFor(undefined), null);
});

test("isDimensionRequired: only Vòng/Nhẫn + Available", () => {
  assert.equal(isDimensionRequired({ category: "Vòng", status: "Available" }), true);
  assert.equal(isDimensionRequired({ category: "Nhẫn", status: "Available" }), true);
  for (const status of ["Paused", "Reserved", "Sold", "Discontinued", "Archived"]) {
    assert.equal(isDimensionRequired({ category: "Vòng", status }), false, status);
  }
  assert.equal(isDimensionRequired({ category: "Chuỗi", status: "Available" }), false);
  assert.equal(isDimensionRequired({ category: undefined, status: "Available" }), false);
});

test("validateProductDimension: Available Vòng/Nhẫn requires all three", () => {
  const base = { category: "Vòng", status: "Available" };
  assert.equal(validateProductDimension({ ...base, dimension_input: "54.5-9.4-6.6" }), null);
  assert.equal(validateProductDimension({ ...base, dimension_input: "54.5-9-6" }), null);
  assert.notEqual(validateProductDimension({ ...base, dimension_input: "54.5-9.4" }), null);
  assert.notEqual(validateProductDimension({ ...base, dimension_input: "54.5" }), null);
  assert.equal(validateProductDimension({ ...base, dimension_input: "" }), DIMENSION_REQUIRED_ERROR);
  assert.equal(validateProductDimension({ ...base }), DIMENSION_REQUIRED_ERROR);
  assert.equal(
    validateProductDimension({ ...base, dimension_ni_mm: 54.5, dimension_chot_mm: 9.4, dimension_day_mm: 6.6 }),
    null
  );
  assert.equal(validateProductDimension({ ...base, dimension_ni_mm: 54.5, dimension_chot_mm: 9.4 }), DIMENSION_REQUIRED_ERROR);
  assert.equal(
    validateProductDimension({ category: "Nhẫn", status: "Available", dimension_ni_mm: 17, dimension_chot_mm: 5.1, dimension_day_mm: 5.2 }),
    null
  );
});

test("validateProductDimension: stored numbers obey the one-decimal rule too", () => {
  const r = validateProductDimension({ category: "Vòng", status: "Available", dimension_ni_mm: 54.55, dimension_chot_mm: 9, dimension_day_mm: 6 });
  assert.notEqual(r, null);
  assert.notEqual(
    validateProductDimension({ category: "Vòng", status: "Available", dimension_ni_mm: -1, dimension_chot_mm: 9, dimension_day_mm: 6 }),
    null
  );
});

test("validateProductDimension: non-Available does not force completion", () => {
  for (const status of ["Paused", "Reserved", "Sold", "Discontinued", "Archived", undefined]) {
    assert.equal(validateProductDimension({ category: "Vòng", status }), null, String(status));
    assert.equal(validateProductDimension({ category: "Nhẫn", status, dimension_input: "" }), null, String(status));
  }
});

test("validateProductDimension: a typed but malformed value is rejected even when not Available", () => {
  assert.notEqual(validateProductDimension({ category: "Vòng", status: "Sold", dimension_input: "54.55-9-6" }), null);
});

test("validateProductDimension: non-target categories are never validated", () => {
  assert.equal(validateProductDimension({ category: "Chuỗi", status: "Available" }), null);
  assert.equal(validateProductDimension({ category: "Chuỗi", status: "Available", dimension_input: "garbage" }), null);
  assert.equal(validateProductDimension({ category: undefined, status: "Available" }), null);
  assert.equal(validateProductDimension({ category: "Bracelet", status: "Available" }), null);
});
