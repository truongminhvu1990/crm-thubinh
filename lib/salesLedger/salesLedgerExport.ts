import ExcelJS from "exceljs";
import { SalesLedgerRow } from "@/types/salesLedger";
import { SalesLedgerColumnContext, SalesLedgerColumnDef } from "./salesLedgerColumns";

/** Export Excel - exports exactly the rows and columns passed in. `rows`
 * must already be filtered by the caller (Feature spec: "Only export
 * currently filtered rows"); `columns` must already be narrowed to the
 * caller's currently *visible* columns (Task 3, Locked Decision 2A: export
 * follows the user's current column visibility, same order, same labels as
 * the table). No recalculation happens here - every value comes from each
 * column's own `exportValue`, the same definition the table itself reads
 * from (lib/salesLedger/salesLedgerColumns.ts). */
export async function exportSalesLedgerToExcel(
  rows: SalesLedgerRow[],
  columns: SalesLedgerColumnDef[],
  ctx: SalesLedgerColumnContext
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sổ bán hàng");

  sheet.addRow(columns.map((c) => c.label));
  rows.forEach((r) => {
    sheet.addRow(columns.map((c) => c.exportValue(r, ctx)));
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
