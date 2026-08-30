import {
  SeedingCampaignObjective,
  SeedingCampaignStatus,
  SeedingCommentCategory,
  SeedingCommentIntent,
  SeedingTaskActionType,
  SeedingTaskStatus,
} from "@/types/seeding";

/** Free text at the DB layer, enforced only here — same convention as
 * lib/partner/partner.constants.ts. */
export const SEEDING_CAMPAIGN_OBJECTIVE_OPTIONS: { value: SeedingCampaignObjective; label: string }[] = [
  { value: "Tăng tương tác", label: "Tăng tương tác" },
  { value: "Tạo thảo luận", label: "Tạo thảo luận" },
  { value: "Kéo inbox", label: "Kéo inbox" },
];

export const SEEDING_CAMPAIGN_STATUS_OPTIONS: { value: SeedingCampaignStatus; label: string }[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Active", label: "Đang chạy" },
  { value: "Completed", label: "Hoàn tất" },
];

export const SEEDING_COMMENT_CATEGORIES: SeedingCommentCategory[] = [
  "hoi_thong_tin",
  "tao_thao_luan",
  "kien_thuc",
  "phan_hoi_tu_nhien",
];

/** Phase 2K-AW — Comment Intent, request-time only (never persisted).
 * "ALL" is the recommended/default option, matching current (pre-2K-AW)
 * behavior byte-for-byte when omitted. */
export const SEEDING_COMMENT_INTENT_OPTIONS: { value: SeedingCommentIntent; label: string }[] = [
  { value: "ALL", label: "Đa dạng / Tổng hợp" },
  { value: "PRICE_INQUIRY", label: "Hỏi giá" },
  { value: "SIZE_INQUIRY", label: "Hỏi size / kích thước" },
  { value: "PRODUCT_INTEREST", label: "Quan tâm sản phẩm" },
  { value: "SOCIAL_PROOF", label: "Tạo tương tác / social proof" },
];

export function seedingCampaignStatusLabel(status: string): string {
  return SEEDING_CAMPAIGN_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

/** Phase 2K-BZ (P2 #3) — the one place a campaign status maps to a Badge
 * variant. The campaign list page already had this exact logic
 * (Active=success, Completed=muted, Draft=warning) but Campaign Detail's
 * own header badge was hardcoded to "warning" regardless of status — a
 * "Completed" campaign showed the same color as a "Draft" one. Both
 * pages now call this single function instead of keeping two
 * independent (and, in one case, wrong) implementations. */
export function seedingCampaignStatusBadgeVariant(status: string): "success" | "warning" | "muted" {
  if (status === "Active") return "success";
  if (status === "Completed") return "muted";
  return "warning";
}

/** Phase 2C — the only 3 actions a human-executed Task can represent. Free
 * text at the DB layer, validated here (same convention as everything
 * else in this file), not a CHECK constraint. */
export const SEEDING_TASK_ACTION_TYPE_OPTIONS: { value: SeedingTaskActionType; label: string }[] = [
  { value: "Like", label: "Like / React" },
  { value: "Comment", label: "Comment" },
  { value: "Share", label: "Share" },
];

export const SEEDING_TASK_STATUS_OPTIONS: { value: SeedingTaskStatus; label: string }[] = [
  { value: "Pending", label: "Chờ xử lý" },
  { value: "In Progress", label: "Đang thực hiện" },
  { value: "Done", label: "Đã hoàn thành" },
  { value: "Failed", label: "Thất bại" },
  { value: "Skipped", label: "Đã bỏ qua" },
  { value: "Cancelled", label: "Đã hủy" },
];

export function seedingTaskStatusLabel(status: string): string {
  return SEEDING_TASK_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function seedingTaskActionTypeLabel(actionType: string): string {
  return SEEDING_TASK_ACTION_TYPE_OPTIONS.find((a) => a.value === actionType)?.label ?? actionType;
}

/** Phase 2K-BX (locked display priority) — the ONE place this priority is
 * implemented, reused everywhere a target's identity is shown (Campaign
 * Detail's target card, the AI-generation target picker, the Distribution
 * modal). Priority 1: the staff's own internal identification
 * (source_label). Priority 2: real Facebook metadata (message). Priority
 * 3: an honest, calm empty state — never a raw id, never a string that
 * reads like broken data. Never derive this independently at a second
 * call site; import and call this instead. */
export function resolveTargetDisplayText(
  target: { source_label: string | null; message: string | null },
  emptyFallback = "Chưa có mô tả bài viết"
): string {
  return target.source_label || target.message || emptyFallback;
}
