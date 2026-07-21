// Enterprise Permission Center (Sprint v4.0.0). New, DB-backed types -
// deliberately separate from the legacy `Permission` union
// (types/permission.ts), which stays untouched for backward compatibility
// (PERMISSION_DATABASE.md §20).

export type DataScope = "own" | "team" | "all";

export type SensitiveFieldKey = "cost_price" | "profit" | "commission" | "company_revenue" | "internal_notes";

/** The 8 named resources Data Scope applies to (Spec §4, DB §13). */
export const DATA_SCOPE_RESOURCES = [
  "customers",
  "orders",
  "revenue",
  "sales_ledger",
  "dashboard",
  "reports",
  "marketing",
  "commissions",
] as const;

export type DataScopeResource = (typeof DATA_SCOPE_RESOURCES)[number];

export const SENSITIVE_FIELD_KEYS: SensitiveFieldKey[] = [
  "cost_price",
  "profit",
  "commission",
  "company_revenue",
  "internal_notes",
];

export interface Role {
  id: string;
  role_key: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionRecord {
  id: string;
  permission_key: string;
  resource: string;
  action: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at?: string;
}

export interface RoleDataScope {
  id: string;
  role_id: string;
  resource: string;
  scope: DataScope;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionSensitiveField {
  id: string;
  permission_key: string;
  field_key: SensitiveFieldKey;
  created_at?: string;
}

/** Team Management's "distinct, non-null team_id" grouping (§7) - not a
 * database row, computed client/server-side from `staff`. */
export interface TeamSummary {
  team_id: string;
  member_count: number;
}
