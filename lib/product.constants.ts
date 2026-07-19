import { Option } from "./customer.constants";

export const PRODUCT_STATUS: Option[] = [
  { value: "Active", label: "Đang bán" },
  { value: "Paused", label: "Tạm ẩn" },
  { value: "Sold", label: "Đã bán" },
  { value: "Discontinued", label: "Ngừng kinh doanh" },
  { value: "Returned", label: "Đã trả NCC" },
];

export const BATCH_STATUS: Option[] = [
  { value: "active", label: "Đang xử lý" },
  { value: "closed", label: "Đã đóng" },
  { value: "returned", label: "Đã trả hàng" },
];

export { labelFor } from "./customer.constants";
