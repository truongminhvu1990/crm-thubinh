import ExcelJS from "exceljs";
import { SalesLedgerRow } from "@/types/salesLedger";
import { COMMISSION_STATUS_LABEL } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";

const COLUMNS = [
  { header: "Ngày bán", width: 14 },
  { header: "Mã sản phẩm", width: 16 },
  { header: "Tên sản phẩm", width: 28 },
  { header: "Khách hàng", width: 24 },
  { header: "Nhân viên", width: 18 },
  { header: "Giá trị bán", width: 16 },
  { header: "Hoa hồng", width: 16 },
  { header: "Trạng thái hoa hồng", width: 18 },
];

/** Export Excel - exports exactly the rows passed in, which callers must
 * already have filtered (Feature spec: "Only export currently filtered
 * rows"). No recalculation - every value here is copied straight from the
 * row already read from the sales_ledger view. */
export async function exportSalesLedgerToExcel(rows: SalesLedgerRow[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sổ bán hàng");

  sheet.addRow(COLUMNS.map((c) => c.header));
  rows.forEach((r) => {
    sheet.addRow([
      formatDate(r.sale_date),
      r.product_code || "",
      r.product_name || "",
      r.customer_name,
      r.salesperson || "",
      Number(r.sale_amount) || 0,
      r.commission_amount !== null ? Number(r.commission_amount) : "",
      r.commission_status ? COMMISSION_STATUS_LABEL[r.commission_status] : "",
    ]);
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });

  sheet.columns.forEach((col, i) => {
    col.width = COLUMNS[i].width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
