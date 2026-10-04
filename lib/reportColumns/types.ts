// Phase 1.6 Wave B0 - shared Reporting Column Management model.
//
// PRESENTATION / USER-PREFERENCE ONLY. Nothing here touches a business calculation, a data fetch or an export.
// Pure data + types (no React, no browser APIs) so the API route and the client read the SAME registry.

/** Named availability conditions (not functions) so the server can evaluate them from a plain boolean context. */
export type AvailabilityToken = "owner_or_manager" | "cost_profit" | "verification_mode" | "can_manage" | "has_edit";

export const AVAILABILITY_TOKENS: readonly AvailabilityToken[] = [
  "owner_or_manager",
  "cost_profit",
  "verification_mode",
  "can_manage",
  "has_edit",
];

export type ColumnContext = Partial<Record<AvailabilityToken, boolean>>;

export interface ColumnMeta {
  /** Stable internal id: never a translated label, never an array index. */
  key: string;
  /** Vietnamese label shown in the Column Manager. */
  label: string;
  /** Cannot be hidden (can still be reordered). */
  mandatory?: boolean;
  /** Column exists only when the context token is true; otherwise it is neither listed nor rendered. */
  availableWhen?: AvailabilityToken;
}

export interface NormalizedColumnPreference {
  /** Effective order of the AVAILABLE columns (visible and hidden). */
  order: string[];
  /** Available columns that are shown. */
  visible: Set<string>;
  /** `order` filtered to visible: what a table renders, left to right. */
  columns: string[];
}
