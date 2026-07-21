// Production Readiness (Sprint v4.0.1) - Ops Console. Every literal below is
// a direct transcription of an already-LOCKED document (PRODUCTION_READINESS_
// SPEC.md, Revision 2) - this file does not invent checklist content, it
// encodes what was already approved so the UI has something concrete to
// render and toggle.

export type Dimension =
  | "Functional"
  | "Security"
  | "Backup"
  | "Recovery"
  | "Monitoring"
  | "Performance"
  | "Deployment"
  | "UAT";

export const DIMENSIONS: Dimension[] = [
  "Functional",
  "Security",
  "Backup",
  "Recovery",
  "Monitoring",
  "Performance",
  "Deployment",
  "UAT",
];

export type ChecklistTier = "critical" | "high" | "low";

export interface ChecklistItem {
  key: string;
  tier: ChecklistTier;
  dimension: Dimension;
  label: string;
}

// PRODUCTION_READINESS_SPEC.md §15 - transcribed verbatim, not re-worded.
export const RELEASE_CHECKLIST: ChecklistItem[] = [
  { key: "crit-rls-verify", tier: "critical", dimension: "Security", label: "Xác nhận việc sửa RLS `authenticated` đã được kiểm chứng thực tế với một phiên đăng nhập thật, không chỉ là đã áp dụng." },
  { key: "crit-backup-confirm", tier: "critical", dimension: "Backup", label: "Xác nhận tình trạng backup/PITR của Production và Development trong Supabase Dashboard." },
  { key: "crit-hosting-doc", tier: "critical", dimension: "Deployment", label: "Ghi lại cơ chế hosting/deploy thực tế của Production." },
  { key: "crit-migration-reconcile", tier: "critical", dimension: "Deployment", label: "Đối chiếu xem migration nào trong ~30 file đã thực sự được áp dụng cho Production." },

  { key: "high-index-migration", tier: "high", dimension: "Performance", label: "Áp dụng migration index hiệu năng đã soạn sẵn." },
  { key: "high-knowledge-rls", tier: "high", dimension: "Security", label: "Xác nhận lại Product Owner vẫn chấp nhận `knowledge_entries` không có RLS." },
  { key: "high-rto-rpo", tier: "high", dimension: "Recovery", label: "Quyết định RTO/RPO." },
  { key: "high-p7-gap", tier: "high", dimension: "Functional", label: "Xác nhận chính thức các module chưa từng được review kiểu P7 (Marketing, Marketing Automation, Sales Commission, Staff, Data Verification, Sales Ledger, Permission Center)." },
  { key: "high-uat-by-role", tier: "high", dimension: "UAT", label: "Hoàn tất UAT theo vai trò (cả 5 vai trò) ít nhất một lần trước khi bàn giao Production." },

  { key: "low-monitoring-approach", tier: "low", dimension: "Monitoring", label: "Quyết định phương án giám sát (monitoring)." },
  { key: "low-csp-hsts", tier: "low", dimension: "Security", label: "Quyết định chính sách CSP/HSTS." },
  { key: "low-error-standard", tier: "low", dimension: "Functional", label: "Quyết định xem mẫu xử lý lỗi hiện tại có trở thành chuẩn bắt buộc cho code mới không." },
  { key: "low-golive-staging", tier: "low", dimension: "Deployment", label: "Quyết định cơ chế môi trường Staging và Pilot rollout trong Go Live Strategy." },
];

export const CHECKLIST_TIER_WEIGHT: Record<ChecklistTier, number> = {
  critical: 3,
  high: 2,
  low: 1,
};

export const CHECKLIST_TIER_LABEL: Record<ChecklistTier, string> = {
  critical: "Critical",
  high: "High",
  low: "Low",
};

// PRODUCTION_READINESS_SPEC.md §21 - Go Live Strategy.
export type GoLiveStage = "dev" | "staging" | "production" | "pilot" | "full_rollout";

export const GO_LIVE_STAGES: { key: GoLiveStage; label: string; available: boolean }[] = [
  { key: "dev", label: "Dev", available: true },
  { key: "staging", label: "Staging", available: false },
  { key: "production", label: "Production", available: true },
  { key: "pilot", label: "Pilot rollout", available: false },
  { key: "full_rollout", label: "Full rollout", available: true },
];

// PRODUCTION_READINESS_SPEC.md §18.1 - Mobile Readiness Checklist.
export const MOBILE_READINESS_ITEMS: { key: string; label: string; status: "missing" | "partial"; note: string }[] = [
  { key: "api_auth", label: "API Authentication", status: "missing", note: "Không có luồng xác thực bearer token nào cho client di động." },
  { key: "token_refresh", label: "Token Refresh", status: "missing", note: "Chưa áp dụng được vì chưa có luồng token nào để làm mới." },
  { key: "versioning", label: "Versioning", status: "missing", note: "Không có tiền tố phiên bản (`/api/v1/...`) trên bất kỳ route nào." },
  { key: "offline_strategy", label: "Offline Strategy", status: "missing", note: "Không có cache cục bộ, không có hàng đợi ghi/đồng bộ khi có mạng lại." },
  { key: "push_notification", label: "Push Notification Readiness", status: "missing", note: "Không có tích hợp APNs/FCM, không có bảng/field lưu device token." },
  { key: "file_upload", label: "File Upload Readiness", status: "partial", note: "Đã có upload ảnh sản phẩm (web), nhưng chưa hỗ trợ resumable/chunked upload hay giới hạn kích thước phía máy chủ cho thiết bị di động." },
];

// PRODUCTION_READINESS_SPEC.md §14.1 - UAT by Role.
export const UAT_ROLES = ["Owner", "Manager", "Sales", "Marketing", "Viewer"] as const;
export type UatRole = (typeof UAT_ROLES)[number];

export interface UatChecklistItem {
  key: string;
  label: string;
}

export function uatItemsForRole(role: UatRole): UatChecklistItem[] {
  if (role === "Owner") {
    return [
      { key: "full_access", label: "Toàn quyền truy cập ứng dụng đã được xác nhận" },
      { key: "admin_access", label: "Truy cập màn hình quản trị Phân quyền (Permission Center) đã được xác nhận" },
    ];
  }
  return [
    { key: "full_access", label: "Toàn quyền truy cập ứng dụng đã được xác nhận (giống mọi vai trò khác ngoài Phân quyền)" },
    { key: "forbidden_write", label: "Thao tác ghi vào /api/permissions/* trả về 403 đã được xác nhận" },
  ];
}

// Environment identity - static, non-secret project references, confirmed
// via `supabase projects list` during this sprint's own investigation.
export const ENVIRONMENTS = [
  { key: "development", label: "Development", projectName: "crm-thubinh-dev-v2", projectRef: "oupgqelswtlvipdhvvmj" },
  { key: "staging", label: "Staging", projectName: null, projectRef: null },
  { key: "production", label: "Production", projectName: "crm-thubinh", projectRef: "ktvrgnhpdarsachxlguy" },
] as const;

export type EnvironmentKey = (typeof ENVIRONMENTS)[number]["key"];

/** Standardized operational activity classification (Decision 36) - the 6
 * canonical activity_logs `entity` values every operational tracker in the
 * Ops Console writes under. Reuses the existing Activity Log structure;
 * introduces no new table. `release_checklist` and `mobile_readiness_note`
 * are separate, pre-existing entity values outside this classification -
 * not renamed here, since Decision 36 names exactly these 6. */
export const OPS_ACTIVITY_ENTITY = {
  DEPLOYMENT: "deployment",
  BACKUP: "backup",
  RESTORE: "restore",
  MIGRATION: "migration",
  UAT: "uat",
  GO_LIVE: "go_live",
} as const;
