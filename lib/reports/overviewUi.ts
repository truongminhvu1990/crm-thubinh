// Phase 1.4 - Reporting UI: presentation helpers ONLY. No business rule lives
// here: every number on screen comes from the canonical Overview services/API
// (Phase 1.1-1.3F). This module owns (1) the one set of display labels, so the
// same metric is never shown under two names, (2) the URL contract that keeps
// the date range when drilling down, and (3) a pure regrouping of already
// computed rows (no recomputation of any amount).

export type SalesMetric = "order-value" | "recognized-revenue" | "unrecognized" | "sold";
export type SalesView = "orders" | "products";
export type InventoryView = "held" | "remaining";

/** The ONLY display names for the Overview metrics. */
export const METRIC_LABELS = {
  totalOrderValue: "Tổng giá trị đơn hàng",
  recognizedRevenue: "Doanh thu đã ghi nhận",
  unrecognizedValue: "Giá trị chưa ghi nhận",
  sold: "Đã bán",
  held: "Hàng đang giữ",
  remaining: "Hàng còn lại",
  cost: "Giá vốn",
  grossProfit: "Lợi nhuận gộp",
} as const;

export const SALES_METRIC_LABEL: Record<SalesMetric, string> = {
  "order-value": METRIC_LABELS.totalOrderValue,
  "recognized-revenue": METRIC_LABELS.recognizedRevenue,
  unrecognized: METRIC_LABELS.unrecognizedValue,
  sold: METRIC_LABELS.sold,
};

const SALES_METRICS = Object.keys(SALES_METRIC_LABEL) as SalesMetric[];

export function parseSalesMetric(value: string | null | undefined): SalesMetric {
  return SALES_METRICS.includes(value as SalesMetric) ? (value as SalesMetric) : "order-value";
}

export function parseSalesView(value: string | null | undefined): SalesView {
  return value === "products" ? "products" : "orders";
}

export function parseInventoryView(value: string | null | undefined): InventoryView {
  return value === "remaining" ? "remaining" : "held";
}

/** `start` / `end` exactly as the canonical endpoints take them (end exclusive).
 * null range = all time = no params. */
export function rangeParams(range: { start: string; end: string } | null): URLSearchParams {
  const p = new URLSearchParams();
  if (range) {
    p.set("start", range.start);
    p.set("end", range.end);
  }
  return p;
}

/** Canonical API URL for a Sales drill-down. The range is the same one the
 * Overview number was computed for. */
export function salesDetailApiUrl(
  metric: SalesMetric,
  range: { start: string; end: string } | null,
  view: SalesView
): string {
  const p = rangeParams(range);
  // Phase 1.5A: the two order-based metrics also have a product view; recognized-revenue is regrouped client-side.
  if (metric === "sold" || metric === "order-value" || metric === "unrecognized") p.set("view", view);
  const q = p.toString();
  return `/api/reports/overview/${metric}${q ? `?${q}` : ""}`;
}

/** Page link used by the Dashboard / hub to open a metric's detail. The date
 * range is NOT in this URL: it lives in the shared Global Date Filter, which
 * persists across pages, so every screen reads the identical range. */
export function salesPageHref(metric: SalesMetric, view?: SalesView): string {
  const p = new URLSearchParams({ metric });
  if (view) p.set("view", view);
  return `/reports/sales?${p.toString()}`;
}

export function inventoryPageHref(view: InventoryView): string {
  return `/reports/inventory?view=${view}`;
}

/** Phase 1.5A: every Sales metric now offers both views (orders without product lines appear as an explicit
 * "Chưa có sản phẩm trong đơn" row, never as an invented product). Kept as a function so callers stay unchanged. */
export function supportsProductView(metric: SalesMetric): boolean {
  return SALES_METRICS.includes(metric);
}

export interface GroupableRecognizedRow {
  order_id: string | null;
  order_number: string | null;
  recognition_date: string;
  customer_name: string;
  amount: number;
  rule_label: string;
}

export interface RecognizedOrderGroup {
  key: string;
  order_id: string | null;
  order_number: string | null;
  recognition_date: string;
  customer_name: string;
  lines: number;
  amount: number;
  rule_label: string;
}

/** Presentation-only regrouping of the recognized-revenue rows by Order (the
 * "Xem theo ĐƠN" view). Every row's amount is carried through untouched, so
 * the groups always sum to the detail total. A legacy (BR-002) row has no
 * Order and stays its own group. */
export function groupRecognizedByOrder(rows: GroupableRecognizedRow[]): RecognizedOrderGroup[] {
  const groups = new Map<string, RecognizedOrderGroup>();
  rows.forEach((r, i) => {
    const key = r.order_id ?? `legacy:${i}`;
    const g = groups.get(key);
    if (g) {
      g.lines += 1;
      g.amount += r.amount;
    } else {
      groups.set(key, {
        key,
        order_id: r.order_id,
        order_number: r.order_number,
        recognition_date: r.recognition_date,
        customer_name: r.customer_name,
        lines: 1,
        amount: r.amount,
        rule_label: r.rule_label,
      });
    }
  });
  return [...groups.values()];
}

/** Visible wording for the Inventory page: it is a current-state report, so
 * it must never show a date period (Phase 1.4.1). */
export const INVENTORY_CURRENT_STATE_LABEL = "Dữ liệu tồn kho hiện tại — không phụ thuộc bộ lọc ngày";

/** Visible (not hover-only) explanation shown next to a disabled
 * "Xem theo SẢN PHẨM" toggle. null when the product view is available. */
export const PRODUCT_VIEW_UNSUPPORTED_NOTE = "Chưa hỗ trợ xem theo sản phẩm: chỉ số này chỉ có dữ liệu theo đơn.";
export function productViewDisabledNote(metric: SalesMetric): string | null {
  return supportsProductView(metric) ? null : PRODUCT_VIEW_UNSUPPORTED_NOTE;
}

export type ReconcileView = "match" | "mismatch" | "pending" | "unavailable";

/** What the reconciliation line may say. "mismatch" ONLY when the overview
 * AND the detail are both really available and really differ. A source that
 * has not arrived yet is "pending"; an overview that failed to load is
 * "unavailable". Neither is ever reported as a discrepancy. */
export function reconcileView(overviewTotal: number | null, detailTotal: number | null, overviewFailed: boolean): ReconcileView {
  if (detailTotal === null) return "pending";
  if (overviewTotal === null) return overviewFailed ? "unavailable" : "pending";
  return overviewTotal === detailTotal ? "match" : "mismatch";
}

/** Detail total must equal the Overview card. Returned (never "fixed"): the
 * page shows a visible warning if they ever differ. */
export function reconcile(overviewTotal: number | null, detailTotal: number | null): "match" | "mismatch" | "pending" {
  if (overviewTotal === null || detailTotal === null) return "pending";
  return overviewTotal === detailTotal ? "match" : "mismatch";
}
