import { Option } from "@/lib/customer.constants";
import { DataScope, DataScopeResource, SensitiveFieldKey } from "@/types/permissionCenter";

export const DATA_SCOPE_RESOURCE_OPTIONS: { value: DataScopeResource; label: string }[] = [
  { value: "customers", label: "Khách hàng" },
  { value: "orders", label: "Đơn hàng" },
  { value: "revenue", label: "Doanh thu" },
  { value: "sales_ledger", label: "Sổ bán hàng" },
  { value: "dashboard", label: "Dashboard" },
  { value: "reports", label: "Báo cáo" },
  { value: "marketing", label: "Marketing" },
  { value: "commissions", label: "Hoa hồng" },
];

export const DATA_SCOPE_OPTIONS: { value: DataScope; label: string }[] = [
  { value: "own", label: "Của tôi" },
  { value: "team", label: "Nhóm" },
  { value: "all", label: "Tất cả" },
];

export const SENSITIVE_FIELD_LABELS: Record<SensitiveFieldKey, { label: string; module: string }> = {
  cost_price: { label: "Giá vốn", module: "Sản phẩm, Tồn kho" },
  profit: { label: "Lợi nhuận", module: "Báo cáo" },
  commission: { label: "Hoa hồng", module: "Hoa hồng, Dashboard" },
  company_revenue: { label: "Doanh thu công ty", module: "Báo cáo, Dashboard, Sổ bán hàng" },
  internal_notes: { label: "Ghi chú nội bộ", module: "Khách hàng" },
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  role_created: "Đã tạo vai trò",
  role_updated: "Đã cập nhật vai trò",
  role_enabled: "Đã kích hoạt vai trò",
  role_disabled: "Đã vô hiệu hóa vai trò",
  permission_granted: "Đã cấp quyền",
  permission_revoked: "Đã thu hồi quyền",
  permissions_cloned: "Đã sao chép quyền",
  data_scope_changed: "Đã đổi phạm vi dữ liệu",
  sensitive_field_paired: "Đã liên kết trường nhạy cảm",
  sensitive_field_unpaired: "Đã gỡ liên kết trường nhạy cảm",
  team_renamed: "Đã đổi tên nhóm",
  team_assigned: "Đã gán vào nhóm",
  team_removed: "Đã gỡ khỏi nhóm",
  staff_role_assigned: "Đã gán vai trò cho nhân viên",
  staff_team_assigned: "Đã gán nhóm cho nhân viên",
};

export const AUDIT_ENTITY_OPTIONS: Option[] = [
  { value: "role", label: "Vai trò" },
  { value: "permission", label: "Quyền" },
  { value: "role_permission", label: "Cấp quyền" },
  { value: "role_data_scope", label: "Phạm vi dữ liệu" },
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export { slugify };
