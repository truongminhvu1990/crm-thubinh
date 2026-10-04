import type { ReportColumnKey } from "@/lib/reportColumns/registry";

/** Per-User Report Column Preferences (Product Owner task, 2026-08-14; extended in Phase 1.6 Wave B0).
 * Stable internal keys only - never a route path or Vietnamese display
 * label, so a page rename never orphans a saved preference. The full list
 * lives in lib/reportColumns/registry.ts. */
export type ReportKey = ReportColumnKey;

export interface ReportColumnPreference {
  reportKey: ReportKey;
  /** Raw saved column keys, exactly as last chosen by the user - NOT
   * pre-intersected with currently-available columns. Normalization happens
   * at read/use time (lib/reportColumns/normalize.ts), so a column that is
   * temporarily unavailable (role change, mode toggle) never gets silently
   * dropped from what is actually saved. */
  visibleColumns: string[];
  /** Wave B0: ALL column keys known when the user last saved (visible and hidden), in display order.
   * null = legacy row / never reordered (see normalizeColumnPreference). */
  columnOrder: string[] | null;
  updatedAt: string;
}
