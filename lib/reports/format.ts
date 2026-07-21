// Shared formatting for the Reports BI Center - avoids re-declaring the
// same Intl.NumberFormat in every new section component.

export const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Sprint v2.2.0 Revision 1, Decision 20 - Empty State. Exact literal text
 * from the Product Owner decision (kept in English, not translated, same
 * as "Coming Soon" elsewhere in this module) - shown in place of 0s across
 * every BI Center card/table/chart whenever a period has zero
 * transactions, never as a silently-rendered "0". */
export const NO_SALES_DATA_MESSAGE = "No sales data found for this period.";
