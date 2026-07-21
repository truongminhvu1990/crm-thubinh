import { Option, BadgeVariant } from "./customer.constants";
import { StaffRole, StaffStatus } from "@/types/staff";

export const STAFF_ROLE_OPTIONS: Option[] = [
  { value: "Owner", label: "Chủ sở hữu" },
  { value: "Manager", label: "Quản lý" },
  { value: "Sales", label: "Kinh doanh" },
  { value: "Marketing", label: "Marketing" },
  { value: "Viewer", label: "Người xem" },
];

export const STAFF_STATUS_OPTIONS: Option[] = [
  { value: "Active", label: "Đang làm việc" },
  { value: "Inactive", label: "Ngừng làm việc" },
];

export const STAFF_STATUS_BADGE_VARIANT: Record<StaffStatus, BadgeVariant> = {
  Active: "success",
  Inactive: "muted",
};

export const STAFF_ROLE_BADGE_VARIANT: Record<StaffRole, BadgeVariant> = {
  Owner: "vip",
  Manager: "secondary",
  Sales: "default",
  Marketing: "warning",
  Viewer: "muted",
};
