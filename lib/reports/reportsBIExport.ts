import ExcelJS from "exceljs";

// Feature 9 - Export Center. One generic Excel writer shared by every BI
// Center table (Product/Category/Customer/Staff Analysis, Revenue Trend)
// instead of a bespoke exporter per section - each call site only supplies
// its own column defs and the rows it is *currently displaying* (already
// filtered/limited by the section's own query), matching the task's
// explicit "Export ONLY currently filtered data."

export interface ExcelColumn<T> {
  header: string;
  width: number;
  value: (row: T) => string | number;
}

export async function exportRowsToExcel<T>(sheetName: string, columns: ExcelColumn<T>[], rows: T[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.addRow(columns.map((c) => c.header));
  rows.forEach((row) => {
    sheet.addRow(columns.map((c) => c.value(row)));
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });

  sheet.columns.forEach((col, i) => {
    col.width = columns[i].width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
