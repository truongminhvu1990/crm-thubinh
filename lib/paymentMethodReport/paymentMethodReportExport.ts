import ExcelJS from "exceljs";
import { PaymentMethodReportRow, PaymentMethodDrillDownRow } from "@/types/paymentMethodReport";
import { ExcelColumn, exportRowsToExcel } from "@/lib/reports/reportsBIExport";
import { formatDate } from "@/lib/utils";

const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

/** Export contains exactly the report's four defined fields, in the same
 * order the table shows them, over whatever rows the caller passes in
 * (already filtered — this function never re-queries or recalculates). */
export async function exportPaymentMethodReportToExcel(rows: PaymentMethodReportRow[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Phương thức thanh toán");

  const headers = ["Phương thức thanh toán", "Số đơn hàng", "Số lượt thanh toán", "Tổng số tiền"];
  sheet.addRow(headers);
  rows.forEach((r) => {
    sheet.addRow([r.paymentMethod, r.orderCount, r.paymentCount, r.totalAmount]);
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });

  sheet.columns = [{ width: 24 }, { width: 14 }, { width: 16 }, { width: 18 }];
  sheet.getColumn(4).numFmt = '#,##0 "₫"';

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Drill-down export (Product Owner task, 2026-08-14) — reuses the shared
 * generic Excel writer (reportsBIExport.ts, already used by Monthly Sold
 * Products/BI Center) rather than a second bespoke ExcelJS routine, per the
 * task's "extend the existing export architecture" instruction. Exactly the
 * fields the drill-down table itself shows, same order — export = what's on
 * screen, matching every other report's own export rule. */
const DRILL_DOWN_EXPORT_COLUMNS: ExcelColumn<PaymentMethodDrillDownRow>[] = [
  { header: "Mã đơn hàng", width: 16, value: (r) => r.orderNumber },
  { header: "Mã sản phẩm", width: 16, value: (r) => r.productCode || "" },
  { header: "Tên sản phẩm", width: 28, value: (r) => r.productName || "" },
  { header: "Khách hàng", width: 24, value: (r) => `${r.customerName} (${r.customerCode})` },
  { header: "Giá bán", width: 16, value: (r) => r.saleAmount },
  { header: "Đã thanh toán", width: 16, value: (r) => r.amountPaid },
  { header: "Tiền còn lại", width: 16, value: (r) => r.remainingBalance },
  { header: "Ngày bán", width: 14, value: (r) => formatDate(r.orderDate) },
  { header: "Phương thức thanh toán", width: 22, value: (r) => r.paymentMethods || "" },
];

export async function exportPaymentMethodDrillDownToExcel(
  paymentMethod: string,
  rows: PaymentMethodDrillDownRow[]
): Promise<Blob> {
  return exportRowsToExcel(`Chi tiet - ${paymentMethod}`.slice(0, 31), DRILL_DOWN_EXPORT_COLUMNS, rows);
}

export { currency as paymentMethodReportCurrency };
