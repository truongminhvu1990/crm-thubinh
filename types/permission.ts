import { StaffRole } from "./staff";

// Feature 7 - Permission Framework. Deliberately a small, representative set
// of permissions (not exhaustive) - this sprint only prepares the framework
// (Role -> Permission -> Route Guard), it doesn't gate every action in the
// app with it yet.
export type Permission =
  | "staff:view"
  | "staff:manage"
  | "customers:manage"
  | "commission:approve"
  | "settings:manage"
  // Marketing CRM Foundation (Sprint v3.0.0), Product Owner Decision - gates
  // Segments/Campaigns mutating actions (docs/MARKETING_SPEC.md Revision 2 §3).
  | "marketing.manage"
  // Marketing Automation (Sprint v3.1.0), docs/MARKETING_AUTOMATION_SPEC.md
  // Revision 2 §2.9 - 4 new literals, dot-separated to match the real
  // `marketing.manage` code convention (not the colon the Foundation spec
  // doc claims). Open Question #13 (role mapping) is still genuinely open -
  // these literals exist so the Permission Framework (hasPermission(),
  // RouteGuard) can check them once a mapping is decided, but no role is
  // assigned any of the 4 below (Revision 1 correction: a prior pass had
  // hardcoded a guessed mapping here - removed, since that decision belongs
  // to the Product Owner, not Development).
  | "marketing.automation.manage"
  | "marketing.broadcast.manage"
  | "marketing.loyalty.manage"
  | "marketing.voucher.manage";

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  Owner: ["staff:view", "staff:manage", "customers:manage", "commission:approve", "settings:manage", "marketing.manage"],
  Manager: ["staff:view", "customers:manage", "commission:approve", "marketing.manage"],
  Sales: ["customers:manage"],
  Marketing: ["customers:manage", "marketing.manage"],
  Viewer: ["staff:view"],
};
