import { AvailabilityToken, ColumnMeta } from "./types";

// Phase 1.6 Wave B0 - the stable report/column registry (source of truth for column ids, default order, mandatory
// columns and availability). Default order = the order listed here = the current Production left-to-right order.
// Wave B0 only DEFINES the registry; tables are wired to it in B1-B3. Existing keys saved in the database
// (sales_ledger, monthly_sold_products, customer_receivable) keep their exact column ids.
//
// c(key, label)       optional column
// c(key, label, "M")  mandatory (cannot be hidden, can be reordered)
// c(key, label, tok)  optional column that exists only when the availability token is true

const c = (key: string, label: string, flag?: "M" | AvailabilityToken): ColumnMeta => ({
  key,
  label,
  ...(flag === "M" ? { mandatory: true } : flag ? { availableWhen: flag } : {}),
});

const ORDER_VALUE_ORDER = [
  c("order_number", "Số đơn", "M"),
  c("order_date", "Ngày đơn"),
  c("customer", "Khách hàng"),
  c("order_status", "Trạng thái đơn"),
  c("payment_status", "Thanh toán"),
  c("order_total", "Giá trị đơn", "M"),
  c("paid_amount", "Đã thu"),
  c("remaining_amount", "Còn lại"),
];

const ORDER_VALUE_PRODUCT = [
  c("order_number", "Số đơn", "M"),
  c("order_date", "Ngày đơn"),
  c("customer", "Khách hàng"),
  c("product", "Sản phẩm", "M"),
  c("category", "Danh mục"),
  c("quantity", "Số lượng"),
  c("unit_price", "Đơn giá"),
  c("discount", "Giảm giá"),
  c("line_amount", "Giá trị dòng", "M"),
  c("order_status", "Trạng thái đơn"),
  c("payment_status", "Thanh toán"),
  c("paid_amount", "Đã thu (cả đơn)"),
  c("remaining_amount", "Còn lại (cả đơn)"),
];

const REASON = c("unrecognized_reason", "Lý do chưa ghi nhận");

const SALES_LEDGER_BASE = [
  c("sale_date", "Ngày bán", "M"),
  c("order_number", "Số đơn"),
  c("product_code", "Mã sản phẩm"),
  c("product_name", "Tên sản phẩm", "M"),
  c("customer", "Khách hàng"),
  c("salesperson", "Nhân viên"),
  c("sale_amount", "Giá trị bán", "M"),
  c("commission_amount", "Hoa hồng"),
];

export const REPORT_COLUMNS = {
  // ---- existing preference tables (ids already stored in the database) ----
  sales_ledger: [
    ...SALES_LEDGER_BASE,
    c("cost_price", "Giá vốn", "cost_profit"),
    c("profit", "Lãi / Lỗ", "cost_profit"),
    c("commission_status", "Trạng thái hoa hồng"),
    c("entry_source", "Nguồn nhập", "verification_mode"),
    c("audit_info", "Thông tin ghi nhận", "verification_mode"),
    c("duplicate", "Trùng lặp", "verification_mode"),
  ],
  data_verification: [
    ...SALES_LEDGER_BASE,
    c("commission_status", "Trạng thái hoa hồng"),
    c("entry_source", "Nguồn nhập"),
    c("audit_info", "Thông tin ghi nhận"),
    c("duplicate", "Trùng lặp", "M"),
  ],
  monthly_sold_products: [
    c("sale_date", "Ngày bán"),
    c("order_number", "Số đơn", "M"),
    c("product_code", "Mã sản phẩm"),
    c("product_name", "Tên sản phẩm", "M"),
    c("product_category", "Danh mục"),
    c("jade_type", "Loại ngọc"),
    c("customer", "Khách hàng"),
    c("salesperson", "Nhân viên"),
    c("original_price", "Giá gốc"),
    c("discount", "Chiết khấu"),
    c("final_sale_price", "Giá bán cuối", "M"),
    c("gross_profit", "Lãi gộp", "owner_or_manager"),
    c("amount_paid", "Đã thanh toán (cả đơn)"),
    c("remaining_balance", "Tiền còn lại (cả đơn)"),
    c("payment_methods", "Phương thức thanh toán"),
    c("recognition", "Ghi nhận doanh thu", "M"),
  ],
  customer_receivable: [
    c("customer", "Khách hàng", "M"),
    c("orderNumber", "Đơn hàng", "M"),
    c("orderDate", "Ngày đặt"),
    c("totalAmount", "Tổng tiền"),
    c("amountPaid", "Đã thanh toán"),
    c("balance", "Còn lại / Dư", "M"),
    c("status", "Trạng thái"),
    c("paymentMethods", "Phương thức thanh toán"),
    c("lastPaymentDate", "Thanh toán gần nhất"),
  ],
  money_debt_ledger: [
    c("date", "Ngày", "M"),
    c("code", "Mã GD", "M"),
    c("party", "Money Changer / Đối tượng"),
    c("type", "Loại"),
    c("content", "Nội dung"),
    c("supplier", "Nhà cung cấp"),
    c("order", "Đơn hàng"),
    c("currency", "Tiền", "M"),
    c("in", "IN", "M"),
    c("out", "OUT", "M"),
    c("fxRate", "Tỷ giá"),
    c("status", "Trạng thái"),
    c("actions", "Thao tác", "has_edit"),
  ],

  // ---- Sales (metric x view) ----
  "sales.order.order_value": ORDER_VALUE_ORDER,
  "sales.order.unrecognized": [...ORDER_VALUE_ORDER, REASON],
  "sales.order.recognized": [
    c("recognition_date", "Ngày ghi nhận"),
    c("order_number", "Số đơn", "M"),
    c("customer", "Khách hàng"),
    c("line_count", "Số dòng"),
    c("rule", "Quy tắc"),
    c("revenue", "Doanh thu", "M"),
  ],
  "sales.order.sold": [
    c("order_number", "Số đơn", "M"),
    c("order_date", "Ngày đơn"),
    c("customer", "Khách hàng"),
    c("product_count", "Số sản phẩm"),
    c("order_status", "Trạng thái đơn"),
    c("payment_status", "Thanh toán"),
    c("recognition", "Ghi nhận"),
    c("sold_value", "Giá trị đã bán", "M"),
    c("paid_amount", "Đã thu"),
    c("remaining_balance", "Còn lại"),
    c("payment_methods", "Hình thức thanh toán"),
  ],
  "sales.product.order_value": ORDER_VALUE_PRODUCT,
  "sales.product.unrecognized": [...ORDER_VALUE_PRODUCT, REASON],
  "sales.product.recognized": [
    c("recognition_date", "Ngày ghi nhận"),
    c("order_number", "Số đơn", "M"),
    c("product", "Sản phẩm", "M"),
    c("customer", "Khách hàng"),
    c("rule", "Quy tắc"),
    c("revenue", "Doanh thu", "M"),
  ],
  "sales.product.sold": [
    c("sale_date", "Ngày đơn"),
    c("order_number", "Số đơn", "M"),
    c("customer", "Khách hàng"),
    c("product", "Sản phẩm", "M"),
    c("category", "Danh mục"),
    c("quantity", "Số lượng"),
    c("unit_price", "Đơn giá"),
    c("discount", "Giảm giá"),
    c("final_price", "Giá bán", "M"),
    c("order_status", "Trạng thái đơn"),
    c("payment_status", "Thanh toán"),
    c("recognition", "Ghi nhận"),
    c("paid_amount", "Đã thu (cả đơn)"),
    c("remaining_balance", "Còn lại (cả đơn)"),
    c("payment_methods", "Hình thức thanh toán"),
  ],
  "sales.sold.itemless": [
    c("order_number", "Số đơn", "M"),
    c("order_date", "Ngày đơn"),
    c("customer", "Khách hàng"),
    c("product_label", "Sản phẩm"),
    c("order_status", "Trạng thái đơn"),
    c("payment_status", "Thanh toán"),
    c("order_total", "Giá trị đơn", "M"),
    c("paid_amount", "Đã thu"),
    c("remaining_balance", "Còn lại"),
  ],

  // ---- Inventory report ----
  "inventory.remaining": [
    c("product_code", "Mã sản phẩm", "M"),
    c("product_name", "Tên"),
    c("category", "Danh mục"),
    c("salesperson", "Nhân viên"),
    c("sale_price", "Giá bán", "M"),
  ],
  "inventory.held": [
    c("product_code", "Mã sản phẩm", "M"),
    c("product_name", "Tên"),
    c("category", "Danh mục"),
    c("salesperson", "Nhân viên"),
    c("sale_price", "Giá bán", "M"),
    c("holding_order", "Đơn đang giữ", "M"),
    c("holding_customer", "Khách hàng"),
    c("holding_order_date", "Ngày đơn"),
  ],

  // ---- remaining Reporting tables (wired in B3) ----
  "payment_method.summary": [
    c("method", "Phương thức thanh toán", "M"),
    c("order_count", "Số đơn hàng"),
    c("payment_count", "Số lượt thanh toán"),
    c("total_amount", "Tổng số tiền", "M"),
  ],
  "payment_method.drilldown": [
    c("order_number", "Mã đơn hàng", "M"),
    c("product_code", "Mã sản phẩm"),
    c("product_name", "Tên sản phẩm", "M"),
    c("customer", "Khách hàng"),
    c("sale_amount", "Giá bán", "M"),
    c("amount_paid", "Đã thanh toán (cả đơn)"),
    c("remaining_balance", "Tiền còn lại (cả đơn)"),
    c("order_date", "Ngày bán"),
    c("payment_methods", "Phương thức thanh toán"),
  ],
  commission_by_salesperson: [
    c("salesperson", "Nhân viên", "M"),
    c("deal_count", "Số giao dịch"),
    c("total_sale_amount", "Doanh số"),
    c("total_commission", "Hoa hồng", "M"),
    c("avg_commission", "Hoa hồng TB"),
  ],
  commission_aging: [
    c("salesperson", "Nhân viên", "M"),
    c("sale_amount", "Doanh số"),
    c("commission_amount", "Hoa hồng", "M"),
    c("days_pending", "Số ngày chờ"),
  ],
  "reconciliation.summary": [
    c("metric", "Chỉ số", "M"),
    c("reports_revenue", "Báo cáo", "M"),
    c("bi_revenue", "Phân tích kinh doanh", "M"),
    c("delta", "Chênh lệch", "M"),
    c("delta_percent", "%"),
  ],
  "reconciliation.customers": [
    c("rank", "#"),
    c("customer", "Khách hàng", "M"),
    c("reports_revenue", "Báo cáo", "M"),
    c("bi_revenue", "Phân tích kinh doanh", "M"),
    c("delta", "Chênh lệch", "M"),
  ],
  operating_expenses: [
    c("expense_date", "Ngày chi phí", "M"),
    c("category", "Danh mục", "M"),
    c("description", "Mô tả"),
    c("amount", "Số tiền", "M"),
    c("created_by", "Người tạo"),
    c("actions", "Thao tác", "can_manage"),
  ],
  "bi.category": [
    c("category", "Danh mục", "M"),
    c("revenue", "Doanh thu", "M"),
    c("transactions", "Giao dịch"),
    c("contribution_pct", "Đóng góp %"),
  ],
  "bi.customer": [
    c("customer", "Khách hàng", "M"),
    c("period_revenue", "Doanh thu kỳ này", "M"),
    c("period_transactions", "Số lần mua"),
    c("avg_sale", "Giá trị TB"),
    c("lifetime_revenue", "Doanh thu trọn đời"),
  ],
  "bi.staff": [
    c("staff", "Nhân viên", "M"),
    c("revenue", "Doanh thu", "M"),
    c("commission", "Hoa hồng"),
    c("transactions", "Giao dịch"),
    c("avg_sale", "Giá trị TB"),
  ],
  "bi.reports.revenue_by_source": [
    c("source", "Nguồn hàng", "M"),
    c("qty_sold", "Số lượng đã bán"),
    c("revenue", "Doanh thu", "M"),
  ],
  "bi.reports.revenue_by_salesperson": [
    c("salesperson", "Nhân viên", "M"),
    c("qty_sold", "Số lượng đã bán"),
    c("revenue", "Doanh thu", "M"),
  ],
  "bi.reports.top_customers": [
    c("customer", "Khách hàng", "M"),
    c("purchases", "Số lần mua"),
    c("revenue", "Doanh thu", "M"),
  ],
  "bi.reports.batch_overdue": [
    c("batch", "Lô hàng", "M"),
    c("due_date", "Hạn trả"),
    c("days_overdue", "Số ngày quá hạn"),
    c("remaining", "Còn lại", "M"),
  ],
  "customers.list": [
    c("customer", "Khách hàng", "M"),
    c("contact", "Liên hệ"),
    c("type", "Loại"),
    c("status", "Trạng thái"),
    c("tags", "Tags"),
    c("followup", "Follow-up"),
    c("source", "Nguồn"),
    c("revenue", "Doanh thu"),
    c("last_purchase", "Mua gần nhất"),
    c("actions", "Thao tác", "M"),
  ],
  "commissions.list": [
    c("date", "Ngày"),
    c("customer", "Khách hàng", "M"),
    c("salesperson", "Nhân viên"),
    c("sale_amount", "Giá trị bán"),
    c("percent", "Tỷ lệ"),
    c("commission_amount", "Hoa hồng", "M"),
    c("status", "Trạng thái"),
    c("paid_at", "Ngày thanh toán"),
  ],
  "dashboard.unrecognized_breakdown": [
    c("order_status", "Trạng thái đơn", "M"),
    c("payment_status", "Trạng thái thanh toán", "M"),
    c("count", "Số đơn"),
    c("value", "Giá trị", "M"),
  ],
  money_changer_balance: [
    c("money_changer", "Money Changer", "M"),
    c("vnd_in", "VND IN"),
    c("vnd_out", "VND OUT"),
    c("vnd_balance", "Số dư VND", "M"),
    c("cny_in", "CNY IN"),
    c("cny_out", "CNY OUT"),
    c("cny_balance", "Số dư CNY", "M"),
    c("status", "Trạng thái"),
  ],
  supplier_balance: [
    c("supplier", "Nhà cung cấp", "M"),
    c("currency", "Đơn vị tiền tệ", "M"),
    c("total_in", "Tổng IN"),
    c("total_out", "Tổng OUT"),
    c("balance", "Số dư", "M"),
    c("last_transaction", "Giao dịch gần nhất"),
  ],
} satisfies Record<string, ColumnMeta[]>;

export type ReportColumnKey = keyof typeof REPORT_COLUMNS;

export const REPORT_KEYS = Object.keys(REPORT_COLUMNS) as ReportColumnKey[];

export function isReportKey(value: unknown): value is ReportColumnKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(REPORT_COLUMNS, value);
}

export function getReportColumns(reportKey: ReportColumnKey): readonly ColumnMeta[] {
  return REPORT_COLUMNS[reportKey];
}
