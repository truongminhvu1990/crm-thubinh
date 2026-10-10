// Dashboard Wave B chart helpers (pure; shared by the F4 / F5 / F8 / F9 charts).

/** Axis labels: 1,2 tỷ / 450 tr / 12 k. Same wording as the Sales Trend axis. */
export function compactMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1).replace(".", ",")} tỷ`;
  if (abs >= 1e6) return `${Math.round(v / 1e6)} tr`;
  if (abs >= 1e3) return `${Math.round(v / 1e3)} k`;
  return String(v);
}

/** Long names never widen the axis: they are cut with an ellipsis here and shown in full in the tooltip / aria label. */
export function truncateLabel(label: string, max = 22): string {
  const chars = Array.from(label);
  return chars.length <= max ? label : `${chars.slice(0, Math.max(1, max - 1)).join("")}…`;
}

const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });
export const formatShare = (share: number): string => percent.format(share);

/** Chart height grows with the number of bars so rows stay readable (and never collapse on a sparse chart). */
export function barChartHeight(rows: number, rowPx = 34): number {
  return Math.max(120, rows * rowPx + 44);
}
