import { Option } from "./customer.constants";

/** Product Status Standardization, BR-003 (LOCKED, 2026-08-21): canonical
 * values are Available/Reserved/Sold/Archived. "Active" is retired in
 * favor of "Available" (1:1 rename). "Returned" is retired - a product
 * returned to supplier now lands on "Archived", with products.returned_at
 * (never this enum) as the sole source of truth for the supplier-return
 * fact (BR-003) - see returnProductToSupplier()/computeBatchCounts().
 * "Paused"/"Discontinued" are intentionally left unresolved (BR-003
 * explicitly does not decide their destination). */
export const PRODUCT_STATUS: Option[] = [
  { value: "Available", label: "Đang bán" },
  { value: "Paused", label: "Tạm ẩn" },
  { value: "Reserved", label: "Đang giữ đơn" },
  { value: "Sold", label: "Đã bán" },
  { value: "Discontinued", label: "Ngừng kinh doanh" },
  { value: "Archived", label: "Đã lưu trữ" },
];

export const BATCH_STATUS: Option[] = [
  { value: "active", label: "Đang xử lý" },
  { value: "closed", label: "Đã đóng" },
  { value: "returned", label: "Đã trả hàng" },
];

export { labelFor } from "./customer.constants";
