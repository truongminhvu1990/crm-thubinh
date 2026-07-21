import { SegmentConditionField, SegmentConditionOperator, SegmentStatus, CampaignStatus } from "@/types/marketing";
import {
  AutomationType,
  AutomationTriggerType,
  AutomationFrequency,
  AutomationRunStatus,
  VoucherStatus,
  LoyaltyTransactionType,
} from "@/types/marketingAutomation";

export const MARKETING_PAGE_SIZE = 20;

export const SEGMENT_TYPE_OPTIONS = [
  { value: "Dynamic", label: "Động (Dynamic)" },
  { value: "Manual", label: "Thủ công (Manual)" },
];

export const SEGMENT_STATUS_OPTIONS: { value: SegmentStatus; label: string }[] = [
  { value: "Active", label: "Đang hoạt động" },
  { value: "Inactive", label: "Tạm ngưng" },
  { value: "Archived", label: "Đã lưu trữ" },
];

export const CAMPAIGN_STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Active", label: "Đang chạy" },
  { value: "Paused", label: "Tạm dừng" },
  { value: "Completed", label: "Hoàn thành" },
  { value: "Cancelled", label: "Đã hủy" },
];

type ValueKind = "number" | "number_range" | "text" | "date" | "days" | "birthday" | "staff_select";

interface ConditionFieldMeta {
  label: string;
  operators: SegmentConditionOperator[];
  valueKind: ValueKind;
}

/** Field -> allowed operators + what shape of Value input the Segment
 * Builder should render, per MARKETING_UI.md §4.1 ("Operator options depend
 * on the chosen Field's data type"). */
export const SEGMENT_CONDITION_FIELDS: Record<SegmentConditionField, ConditionFieldMeta> = {
  purchase_count: { label: "Số lần mua", operators: ["equals", "greater_than", "less_than", "between"], valueKind: "number" },
  lifetime_revenue: { label: "Tổng doanh thu", operators: ["equals", "greater_than", "less_than", "between"], valueKind: "number" },
  last_purchase: { label: "Lần mua gần nhất", operators: ["before", "after", "within_last_days"], valueKind: "date" },
  first_purchase: { label: "Lần mua đầu tiên", operators: ["before", "after", "within_last_days"], valueKind: "date" },
  birthday: { label: "Sinh nhật", operators: ["equals"], valueKind: "birthday" },
  province: { label: "Khu vực (Tỉnh/TP)", operators: ["equals", "contains"], valueKind: "text" },
  district: { label: "Địa phương", operators: ["equals", "contains"], valueKind: "text" },
  assigned_staff: { label: "Nhân viên phụ trách", operators: ["equals"], valueKind: "staff_select" },
  favorite_category: { label: "Danh mục yêu thích (đã mua)", operators: ["equals", "contains"], valueKind: "text" },
  favorite_product: { label: "Sản phẩm yêu thích (đã mua)", operators: ["equals", "contains"], valueKind: "text" },
  favorite_color: { label: "Màu sắc yêu thích", operators: ["contains"], valueKind: "text" },
  budget: { label: "Ngân sách", operators: ["equals", "contains"], valueKind: "text" },
  vip_level: { label: "Cấp độ VIP", operators: ["equals"], valueKind: "text" },
};

export const SEGMENT_CONDITION_OPERATOR_LABELS: Record<SegmentConditionOperator, string> = {
  equals: "Bằng",
  not_equals: "Khác",
  contains: "Chứa",
  greater_than: "Lớn hơn",
  less_than: "Nhỏ hơn",
  between: "Trong khoảng",
  before: "Trước ngày",
  after: "Sau ngày",
  within_last_days: "Trong N ngày qua",
};

/** Feature 1's pre-built Dynamic segment templates (Spec §2.1) - a starting
 * condition set the user can use as-is or adjust, not a stored DB concept
 * (MARKETING_DATABASE.md §2 "Deliberately absent: an 'is template' flag").
 * Numeric thresholds are intentionally NOT hardcoded here (Product Owner
 * Decision) - templates for High/Low Value ship with an empty condition
 * row for the user to fill in, not a preset number. */
export const SEGMENT_TEMPLATES: {
  key: string;
  label: string;
  conditionLogic: "AND" | "OR";
  conditions: Omit<import("@/types/marketing").MarketingSegmentCondition, "segment_id" | "sort_order">[];
}[] = [
  {
    key: "vip",
    label: "Khách hàng VIP",
    conditionLogic: "AND",
    conditions: [{ field: "vip_level", operator: "equals", value: "VIP" }],
  },
  {
    key: "new_customer",
    label: "Khách hàng mới",
    conditionLogic: "AND",
    conditions: [{ field: "first_purchase", operator: "within_last_days", value: 30 }],
  },
  {
    key: "returning_customer",
    label: "Khách hàng quay lại",
    conditionLogic: "AND",
    conditions: [{ field: "purchase_count", operator: "greater_than", value: 1 }],
  },
  {
    key: "no_purchase_30",
    label: "Không mua hàng 30 ngày",
    conditionLogic: "AND",
    // Relative day-count (not a frozen ISO date) - stays "live"/rolling on
    // every re-evaluation, per marketing_match_condition()'s relative-value
    // support (20260728_marketing_relative_dates.sql).
    conditions: [{ field: "last_purchase", operator: "before", value: 30 }],
  },
  {
    key: "no_purchase_60",
    label: "Không mua hàng 60 ngày",
    conditionLogic: "AND",
    conditions: [{ field: "last_purchase", operator: "before", value: 60 }],
  },
  {
    key: "no_purchase_90",
    label: "Không mua hàng 90 ngày",
    conditionLogic: "AND",
    conditions: [{ field: "last_purchase", operator: "before", value: 90 }],
  },
  {
    key: "high_value",
    label: "Giá trị cao",
    conditionLogic: "AND",
    conditions: [{ field: "lifetime_revenue", operator: "greater_than", value: 0 }],
  },
  {
    key: "low_value",
    label: "Giá trị thấp",
    conditionLogic: "AND",
    conditions: [{ field: "lifetime_revenue", operator: "less_than", value: 0 }],
  },
  {
    key: "birthday_this_month",
    label: "Sinh nhật tháng này",
    conditionLogic: "AND",
    conditions: [{ field: "birthday", operator: "equals", value: "this_month" }],
  },
  {
    key: "birthday_today",
    label: "Sinh nhật hôm nay",
    conditionLogic: "AND",
    conditions: [{ field: "birthday", operator: "equals", value: "today" }],
  },
];

// ============================================================
// Marketing Automation (Sprint v3.1.0) - docs/MARKETING_AUTOMATION_UI.md §4
// ("lib/marketing/marketing.constants.ts extended, not duplicated").
// ============================================================

export const AUTOMATION_TYPE_OPTIONS: { value: AutomationType; label: string }[] = [
  { value: "Birthday Greeting", label: "Chúc mừng sinh nhật" },
  { value: "Welcome Customer", label: "Chào mừng khách hàng mới" },
  { value: "No Purchase 30 Days", label: "Không mua hàng 30 ngày" },
  { value: "No Purchase 60 Days", label: "Không mua hàng 60 ngày" },
  { value: "No Purchase 90 Days", label: "Không mua hàng 90 ngày" },
  { value: "VIP Upgrade", label: "Nâng hạng VIP" },
  { value: "Manual Broadcast", label: "Gửi tin thủ công" },
];

/** Reuses CAMPAIGN_STATUS_OPTIONS's exact 5 values/labels as-is (Spec Rev.2
 * decision #3 - Automation reuses Campaign's locked lifecycle). */
export const AUTOMATION_STATUS_OPTIONS = CAMPAIGN_STATUS_OPTIONS;

export const TRIGGER_TYPE_OPTIONS: { value: AutomationTriggerType; label: string }[] = [
  { value: "Manual", label: "Thủ công" },
  { value: "Daily Schedule", label: "Lịch hàng ngày" },
];

export const FREQUENCY_OPTIONS: { value: AutomationFrequency; label: string }[] = [
  { value: "Once", label: "Một lần" },
  { value: "Daily", label: "Hàng ngày" },
  { value: "Weekly", label: "Hàng tuần" },
  { value: "Monthly", label: "Hàng tháng" },
];

export const RUN_STATUS_OPTIONS: { value: AutomationRunStatus; label: string }[] = [
  { value: "Pending", label: "Chờ xử lý" },
  { value: "Running", label: "Đang chạy" },
  { value: "Success", label: "Thành công" },
  { value: "Failed", label: "Thất bại" },
  { value: "Cancelled", label: "Đã hủy" },
];

export const VOUCHER_STATUS_OPTIONS: { value: VoucherStatus; label: string }[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Active", label: "Đang hoạt động" },
  { value: "Expired", label: "Hết hạn" },
  { value: "Disabled", label: "Vô hiệu hóa" },
];

export const LOYALTY_TXN_TYPE_OPTIONS: { value: LoyaltyTransactionType; label: string }[] = [
  { value: "Earn", label: "Tích điểm" },
  { value: "Adjust", label: "Điều chỉnh" },
  { value: "Expire", label: "Hết hạn" },
];
