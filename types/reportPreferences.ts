/** Per-User Report Column Preferences (Product Owner task, 2026-08-14).
 * Stable internal keys only — never a route path or Vietnamese display
 * label, so a page rename never orphans a saved preference. */
export type ReportKey = "sales_ledger" | "monthly_sold_products";

export interface ReportColumnPreference {
  reportKey: ReportKey;
  /** Raw saved column keys, exactly as last chosen by the user — NOT
   * pre-intersected with currently-available columns. Intersecting with
   * availability happens at read/use time (lib/hooks/useReportColumnPreference.ts),
   * so a column that's temporarily unavailable (role change, mode toggle)
   * never gets silently dropped from what's actually saved. */
  visibleColumns: string[];
  updatedAt: string;
}
