import ExcelJS from "exceljs";
import { Product } from "@/types/product";

/** Quick Import field list - the writable Product fields a spreadsheet can
 * realistically carry. Excludes batch_id (internal FK, not spreadsheet
 * data) and available/reserved/sold (never writable from the app). Column
 * order matches the header row written into the downloadable template, and
 * is also what parseProductImportFile reads back - same field-name-header
 * convention as lib/customerImportExport.ts's CSV import. */
export const PRODUCT_IMPORT_FIELDS: (keyof Product)[] = [
  "product_code",
  "product_name",
  "category",
  "status",
  "color",
  "size",
  "weight",
  "jade_grade",
  "cost_price",
  "sale_price",
  "discount",
  "location",
  "certificate_no",
  "supplier",
  "source",
  "salesperson",
  "sku",
  "notes",
];

const NUMERIC_FIELDS = new Set<keyof Product>(["size", "weight", "cost_price", "sale_price", "discount"]);

const FIELD_LABELS: Record<string, string> = {
  product_code: "Mã sản phẩm",
  product_name: "Tên sản phẩm",
  category: "Danh mục",
  status: "Trạng thái",
  color: "Màu sắc",
  size: "Kích thước",
  weight: "Trọng lượng",
  jade_grade: "Chất lượng đá",
  cost_price: "Giá vốn",
  sale_price: "Giá bán",
  discount: "Giảm giá (%)",
  location: "Vị trí",
  certificate_no: "Số chứng chỉ",
  supplier: "Nhà cung cấp",
  source: "Nguồn hàng",
  salesperson: "Nhân viên",
  sku: "SKU",
  notes: "Ghi chú",
};

const SAMPLE_ROW: Record<string, string | number> = {
  product_code: "VD001",
  product_name: "Vòng tay ngọc bích",
  category: "Vòng tay",
  status: "Active",
  color: "Xanh lá",
  size: 15,
  weight: 20,
  jade_grade: "A",
  cost_price: 5000000,
  sale_price: 8000000,
  discount: 0,
  location: "Kệ A1",
  certificate_no: "",
  supplier: "Công ty Myanmar",
  source: "Myanmar",
  salesperson: "Nguyễn Văn A",
  sku: "SKU001",
  notes: "",
};

/** Builds the downloadable Quick Import template: header row (field
 * names, matched back on parse) + one filled example row so the expected
 * shape and units are obvious without a separate instructions sheet. */
export async function buildProductImportTemplate(): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sản phẩm");

  sheet.addRow(PRODUCT_IMPORT_FIELDS);
  sheet.addRow(PRODUCT_IMPORT_FIELDS.map((field) => SAMPLE_ROW[field] ?? ""));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });

  sheet.columns.forEach((col, i) => {
    const field = PRODUCT_IMPORT_FIELDS[i];
    col.width = Math.max(14, (FIELD_LABELS[field] || field).length + 4);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export interface ParsedProductRow {
  rowNumber: number;
  data: Partial<Product>;
  errors: string[];
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return (value.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in value) return String((value as { text: unknown }).text ?? "");
    if ("result" in value) return String((value as { result: unknown }).result ?? "");
    return "";
  }
  return String(value).trim();
}

/** Row-level validation - same rules already enforced in app/products/page.tsx's
 * own validateProduct(), reused rather than restated with different
 * thresholds. */
function validateRow(data: Partial<Product>, rawInvalidNumeric: string[]): string[] {
  const errors: string[] = [...rawInvalidNumeric];
  if (!data.product_code) errors.push("Thiếu mã sản phẩm");
  if (!data.product_name) errors.push("Thiếu tên sản phẩm");
  if (data.cost_price !== undefined && data.cost_price < 0) errors.push("Giá vốn không được âm");
  if (data.sale_price !== undefined && data.sale_price < 0) errors.push("Giá bán không được âm");
  if (data.weight !== undefined && data.weight < 0) errors.push("Trọng lượng không được âm");
  if (data.size !== undefined && data.size < 0) errors.push("Kích thước không được âm");
  if (data.discount !== undefined && (data.discount < 0 || data.discount > 100))
    errors.push("Giảm giá phải trong khoảng 0-100%");
  return errors;
}

/** Parses a Quick Import workbook (as produced by buildProductImportTemplate,
 * or any .xlsx whose first sheet's header row uses the same field names).
 * Unknown columns are ignored; missing columns are left unset. Row numbers
 * are 1-indexed spreadsheet row numbers (so row 2 is the first data row,
 * matching what the user sees in Excel). Blank rows are skipped. */
export async function parseProductImportFile(file: File): Promise<ParsedProductRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const columnFields: (keyof Product | undefined)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const key = cellToString(cell.value);
    if ((PRODUCT_IMPORT_FIELDS as string[]).includes(key)) columnFields[colNumber] = key as keyof Product;
  });

  const rows: ParsedProductRow[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);

    const raw: Partial<Record<keyof Product, string>> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const field = columnFields[colNumber];
      if (!field) return;
      const value = cellToString(cell.value);
      if (value !== "") raw[field] = value;
    });

    if (Object.keys(raw).length === 0) continue; // blank row

    const data: Partial<Product> = {};
    const rawInvalidNumeric: string[] = [];

    for (const [field, value] of Object.entries(raw) as [keyof Product, string][]) {
      if (NUMERIC_FIELDS.has(field)) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          rawInvalidNumeric.push(`${FIELD_LABELS[field]}: giá trị "${value}" không phải là số`);
          continue;
        }
        (data as Record<string, number>)[field] = num;
      } else {
        (data as Record<string, string>)[field] = value;
      }
    }

    rows.push({ rowNumber: r, data, errors: validateRow(data, rawInvalidNumeric) });
  }

  return rows;
}
