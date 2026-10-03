import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { PRODUCT_IMPORT_FIELDS, buildProductImportTemplate, parseProductImportFile } from "./productImportExport";

/** Quick Import: three optional Ni-Chột-Dày columns (PO spec 2026-10-04). */

async function workbookFile(header: string[], rows: (string | number)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sản phẩm");
  sheet.addRow(header);
  rows.forEach((r) => sheet.addRow(r));
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new File([buf], "import.xlsx");
}

test("template header carries the three new columns, and no combined-string column", () => {
  assert.ok(PRODUCT_IMPORT_FIELDS.includes("dimension_ni_mm"));
  assert.ok(PRODUCT_IMPORT_FIELDS.includes("dimension_chot_mm"));
  assert.ok(PRODUCT_IMPORT_FIELDS.includes("dimension_day_mm"));
  assert.equal((PRODUCT_IMPORT_FIELDS as string[]).includes("dimension_input"), false);
});

test("template workbook builds and its header round-trips through the parser", async () => {
  const blob = await buildProductImportTemplate();
  const rows = await parseProductImportFile(new File([await blob.arrayBuffer()], "t.xlsx"));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].errors, []); // the sample row stays importable
});

test("OLD file without the new columns still imports unchanged (incl. Available Vòng, size kept)", async () => {
  const file = await workbookFile(
    ["product_code", "product_name", "category", "status", "size"],
    [["O1", "Old", "Chuỗi", "Available", 15], ["O2", "Old2", "Vòng", "Sold", 17.5]]
  );
  const rows = await parseProductImportFile(file);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].errors, []);
  assert.deepEqual(rows[1].errors, []);
  assert.equal(rows[0].data.size, 15);
});

test("valid three-column row (Available Vòng) parses to numbers", async () => {
  const file = await workbookFile(
    ["product_code", "product_name", "category", "status", "dimension_ni_mm", "dimension_chot_mm", "dimension_day_mm"],
    [["V1", "V", "Vòng", "Available", 54.5, 9.4, 6.6]]
  );
  const [row] = await parseProductImportFile(file);
  assert.deepEqual(row.errors, []);
  assert.equal(row.data.dimension_ni_mm, 54.5);
  assert.equal(row.data.dimension_chot_mm, 9.4);
  assert.equal(row.data.dimension_day_mm, 6.6);
});

test("integer cells are valid", async () => {
  const file = await workbookFile(
    ["product_code", "product_name", "category", "status", "dimension_ni_mm", "dimension_chot_mm", "dimension_day_mm"],
    [["N1", "N", "Nhẫn", "Available", 54, 10, 10]]
  );
  const [row] = await parseProductImportFile(file);
  assert.deepEqual(row.errors, []);
});

test("too many decimals is rejected with a message naming the column", async () => {
  const file = await workbookFile(
    ["product_code", "product_name", "category", "status", "dimension_ni_mm", "dimension_chot_mm", "dimension_day_mm"],
    [["V2", "V", "Vòng", "Available", "54.55", 9, 6]]
  );
  const [row] = await parseProductImportFile(file);
  assert.equal(row.errors.length, 1);
  assert.match(row.errors[0], /Ni \(mm\)/);
});

test("negative, exponent and comma-decimal cells are rejected", async () => {
  for (const bad of ["-1", "1e3", "54,5", "abc"]) {
    const file = await workbookFile(
      ["product_code", "product_name", "category", "status", "dimension_ni_mm", "dimension_chot_mm", "dimension_day_mm"],
      [["V3", "V", "Vòng", "Sold", bad, 9, 6]]
    );
    const [row] = await parseProductImportFile(file);
    assert.ok(row.errors.length >= 1, `cell ${bad}`);
  }
});

test("incomplete Available Vòng/Nhẫn row is rejected", async () => {
  const file = await workbookFile(
    ["product_code", "product_name", "category", "status", "dimension_ni_mm", "dimension_chot_mm", "dimension_day_mm"],
    [
      ["V4", "V", "Vòng", "Available", 54.5, 9.4, ""],
      ["N4", "N", "Nhẫn", "Available", "", "", ""],
    ]
  );
  const rows = await parseProductImportFile(file);
  assert.ok(rows[0].errors.length >= 1);
  assert.ok(rows[1].errors.length >= 1);
});

test("incomplete / empty columns are fine for non-Available and non-target rows", async () => {
  const file = await workbookFile(
    ["product_code", "product_name", "category", "status", "dimension_ni_mm", "dimension_chot_mm", "dimension_day_mm"],
    [
      ["V5", "V", "Vòng", "Paused", 54.5, "", ""],
      ["C5", "C", "Chuỗi", "Available", "", "", ""],
    ]
  );
  const rows = await parseProductImportFile(file);
  assert.deepEqual(rows[0].errors, []);
  assert.deepEqual(rows[1].errors, []);
});
