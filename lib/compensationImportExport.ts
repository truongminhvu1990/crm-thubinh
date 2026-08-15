import { Compensation } from "@/types/compensation";
import { toCsv } from "./csv";
import { compensationStatusLabel, compensationTypeLabel } from "./compensation/compensation.constants";

export const COMPENSATION_CSV_HEADER = [
  "Mã Compensation",
  "Người nhận",
  "Loại",
  "Đơn hàng",
  "Khách hàng",
  "Sản phẩm",
  "Cơ sở tính",
  "Phương thức",
  "Giá trị",
  "Số tiền tính toán",
  "Trạng thái",
  "Ngày tạo",
];

export function exportCompensationsToCsv(compensations: Compensation[]): string {
  const rows: (string | number)[][] = [
    COMPENSATION_CSV_HEADER,
    ...compensations.map((c) => [
      c.compensation_code,
      c.partner?.name ?? "",
      compensationTypeLabel(c.compensation_type),
      c.order?.order_number ?? "",
      c.customer?.full_name ?? "",
      c.product?.product_name ?? "",
      c.basis,
      c.method,
      c.value,
      c.calculated_amount,
      compensationStatusLabel(c.status),
      c.created_at ? c.created_at.slice(0, 10) : "",
    ]),
  ];
  return toCsv(rows);
}
