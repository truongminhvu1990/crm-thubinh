export interface Option {
  value: string;
  label: string;
  swatch?: string;
}

export const GENDER_OPTIONS: Option[] = [
  { value: "Nam", label: "Nam" },
  { value: "Nữ", label: "Nữ" },
  { value: "Khác", label: "Khác" },
];

export const JADE_ORIGINS: Option[] = [
  { value: "Myanmar", label: "Myanmar" },
  { value: "Guatemala", label: "Guatemala" },
  { value: "Other", label: "Khác" },
];

export function labelFor(options: Option[], value?: string | null): string | undefined {
  return options.find((o) => o.value === value)?.label;
}

// VIP Care
export type BadgeVariant =
  | "default"
  | "secondary"
  | "vip"
  | "success"
  | "warning"
  | "destructive"
  | "muted";

export const CUSTOMER_STATUS_OPTIONS: Option[] = [
  { value: "New", label: "Mới" },
  { value: "Contacted", label: "Đã liên hệ" },
  { value: "Negotiating", label: "Đang đàm phán" },
  { value: "Purchased", label: "Đã mua" },
  { value: "Returning", label: "Khách quay lại" },
  { value: "Inactive", label: "Không hoạt động" },
];

export const CUSTOMER_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  New: "muted",
  Contacted: "secondary",
  Negotiating: "warning",
  Purchased: "success",
  Returning: "vip",
  Inactive: "destructive",
};

// Preset customer tags, seeded into tag_options (category "customer_tag").
// Users can still add free-form custom tags on top of these via the same
// Creatable Multi-Select used for favorite_type/favorite_color.
export const PRESET_CUSTOMER_TAGS = ["VIP", "Potential", "Wholesale", "Retail", "Important", "Follow Up"];

export type FollowUpUrgency = "overdue" | "today" | "soon" | "future" | "none";

/** Local-date comparison (no timezone library in this project) - matches
 * the same "yyyy-MM-dd as a plain date" convention already used by
 * `birthday`. */
export function getFollowUpUrgency(dateStr?: string | null): FollowUpUrgency {
  if (!dateStr) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "soon";
  return "future";
}

export const FOLLOWUP_URGENCY_LABEL: Record<FollowUpUrgency, string> = {
  overdue: "Quá hạn",
  today: "Hôm nay",
  soon: "Sắp tới",
  future: "Sắp tới",
  none: "Chưa có lịch hẹn",
};

export const FOLLOWUP_URGENCY_BADGE_VARIANT: Record<FollowUpUrgency, BadgeVariant> = {
  overdue: "destructive",
  today: "warning",
  soon: "default",
  future: "muted",
  none: "muted",
};

export const FOLLOWUP_FILTERS: Option[] = [
  { value: "ALL", label: "Tất cả" },
  { value: "OVERDUE", label: "Quá hạn" },
  { value: "TODAY", label: "Hôm nay" },
  { value: "NEXT_7_DAYS", label: "7 ngày tới" },
  { value: "NONE", label: "Chưa có lịch hẹn" },
];

// Follow-up Center (Sprint v1.1.1)

/** Exact timeline content written by completeFollowUp() - shared with
 * wasFollowUpCompletedToday() below so the "Completed Today" section can
 * recognize a completion event without a new column/table. */
export const FOLLOWUP_COMPLETED_MESSAGE = "Đã hoàn tất lịch chăm sóc";

function isSameLocalDate(iso: string, reference: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === reference.getFullYear() &&
    d.getMonth() === reference.getMonth() &&
    d.getDate() === reference.getDate()
  );
}

/** True if this customer's most recent follow-up was completed today -
 * derived from the existing notes-JSON timeline (see FOLLOWUP_COMPLETED_MESSAGE),
 * no new field required. */
export function wasFollowUpCompletedToday(notes: { type?: string; content: string; created_at: string }[]): boolean {
  const event = notes.find(
    (n) => n.type === "followup_updated" && n.content === FOLLOWUP_COMPLETED_MESSAGE
  );
  return !!event?.created_at && isSameLocalDate(event.created_at, new Date());
}

/** Days elapsed since last contact - Feature 7 of the Follow-up Center spec.
 * Always derived from `last_contacted`, never stored or editable. */
export function getDaysSinceLastContact(lastContacted?: string | null): number | null {
  if (!lastContacted) return null;
  const diffMs = Date.now() - new Date(lastContacted).getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}
