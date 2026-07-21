import { SalesLedgerRow } from "@/types/salesLedger";
import { ExcelColumn } from "@/lib/reports/reportsBIExport";
import { COMMISSION_STATUS_LABEL } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";

// Feature 9 - Verification Export (Excel only, current filtered data).
// Reuses the generic Excel writer from lib/reports/reportsBIExport.ts
// (Sprint v2.2.0) rather than touching Sales Ledger's own exporter
// (lib/salesLedger/salesLedgerExport.ts) - that one's column set is
// Sales Ledger's, unrelated to and untouched by this sprint; this is a
// separate, verification-specific column list over the same row shape.
export const VERIFICATION_EXPORT_COLUMNS: ExcelColumn<SalesLedgerRow>[] = [
  { header: "Ngày bán", width: 14, value: (r) => formatDate(r.sale_date) },
  { header: "Mã sản phẩm", width: 16, value: (r) => r.product_code || "" },
  { header: "Tên sản phẩm", width: 26, value: (r) => r.product_name || "" },
  { header: "Khách hàng", width: 22, value: (r) => r.customer_name },
  { header: "Nhân viên", width: 18, value: (r) => r.salesperson || "" },
  { header: "Giá trị bán", width: 16, value: (r) => Number(r.sale_amount) || 0 },
  { header: "Hoa hồng", width: 14, value: (r) => (r.commission_amount !== null ? Number(r.commission_amount) : "") },
  { header: "Trạng thái hoa hồng", width: 16, value: (r) => (r.commission_status ? COMMISSION_STATUS_LABEL[r.commission_status] : "") },
  { header: "Nguồn nhập", width: 16, value: (r) => r.entry_source },
  { header: "Người tạo", width: 18, value: (r) => r.created_by || "" },
  { header: "Ngày tạo", width: 16, value: (r) => formatDate(r.purchase_created_at) },
  { header: "Người cập nhật", width: 18, value: (r) => r.updated_by || "" },
  { header: "Ngày cập nhật", width: 16, value: (r) => formatDate(r.updated_at) },
  { header: "Nghi ngờ trùng lặp", width: 18, value: (r) => (r.is_duplicate ? "Possible Duplicate" : "") },
];
