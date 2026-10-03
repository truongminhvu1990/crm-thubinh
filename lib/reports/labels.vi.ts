// Phase 1.5A - the ONE place that turns internal Reporting values into Vietnamese text for end users.
//
// Presentation only. Internal values (order_status, payment_status, payment_method, rule/reason codes) are never
// changed in the database or in any service; they are translated here, at render time.
//
// Vocabulary rules (Product Owner approval, Phase 1.5A):
//  - Order / payment statuses reuse the labels the Orders module already defines (lib/orders/order.constants.ts),
//    so Reporting and Orders can never disagree. In particular "Lost" ("Đã mất") and "Cancelled" ("Đã hủy") are
//    DIFFERENT states and stay different.
//  - payment_method: only the two values with an unambiguous label are translated (Bank Transfer, Cash).
//    Everything else (ck, ckh, tm, TECH_H, ...) is shown exactly as stored - no guessing.
//  - Internal rule codes (BR-001 / BR-002) are never shown to end users.

import { ORDER_STATUS, PAYMENT_STATUS, labelFor } from "@/lib/orders/order.constants";
import { PRODUCT_STATUS } from "@/lib/product.constants";
import type { UnrecognizedReasonCode } from "@/lib/reports/revenueDefinition";

/** Shown for a missing (null / undefined / empty) value. */
export const EMPTY_VALUE = "—";

/** Approved glossary (Product Owner, Phase 1.5A, P2). */
export const TERMS = {
  reports: "Báo cáo",
  businessIntelligence: "Phân tích kinh doanh",
  supplier: "Nhà cung cấp",
  moneyDebtLedger: "Sổ công nợ tiền",
  followUpSummary: "Tóm tắt theo dõi",
  comingSoon: "Sắp ra mắt",
} as const;

/** Product Owner amendment of Sprint v2.2.0 Decision 20 (Phase 1.5A, P1): the empty-state sentence is now Vietnamese. */
export const NO_SALES_DATA_TEXT = "Không có dữ liệu bán hàng trong kỳ này.";

/** Presentation row for an order that has no product line. It is NOT a product and is never stored. */
export const NO_ITEMS_ROW_LABEL = "Chưa có sản phẩm trong đơn";

/** Presentation row that keeps the product view reconciled when an order's total differs from the sum of its lines. */
export const ORDER_LEVEL_DIFFERENCE_LABEL = "Chênh lệch cấp đơn (ngoài các dòng sản phẩm)";

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** "Completed" -> "Hoàn thành", "Lost" -> "Đã mất", "Cancelled" -> "Đã hủy" ... Unknown value: shown, flagged as unknown. */
export function orderStatusLabel(value: unknown): string {
  const v = clean(value);
  if (v === null) return EMPTY_VALUE;
  return labelFor(ORDER_STATUS, v) ?? `Không xác định (${v})`;
}

/** "Paid" -> "Đã thanh toán", "Partially Paid" -> "Thanh toán một phần", "Unpaid" -> "Chưa thanh toán". */
export function paymentStatusLabel(value: unknown): string {
  const v = clean(value);
  if (v === null) return EMPTY_VALUE;
  return labelFor(PAYMENT_STATUS, v) ?? `Không xác định (${v})`;
}

/** Product (inventory) status: reuses lib/product.constants.ts. The retired legacy value "Active" has no label there
 * and is shown flagged as unknown rather than guessed. */
export function productStatusLabel(value: unknown): string {
  const v = clean(value);
  if (v === null) return EMPTY_VALUE;
  return labelFor(PRODUCT_STATUS, v) ?? `Không xác định (${v})`;
}

/** The recognition flag the canonical datasets carry on every Sold line / order. */
export function recognitionLabel(value: unknown): string {
  if (value === "recognized") return "Đã ghi nhận";
  if (value === "unrecognized") return "Chưa ghi nhận";
  return EMPTY_VALUE;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  "Bank Transfer": "Chuyển khoản",
  Cash: "Tiền mặt",
};

/** One value or a comma-separated list ("Bank Transfer, Chuyển khoản"): translate only the two approved values,
 * keep every other token verbatim, drop exact duplicates that translation itself creates. */
export function paymentMethodLabel(value: unknown): string {
  const v = clean(value);
  if (v === null) return EMPTY_VALUE;
  const out: string[] = [];
  for (const raw of v.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const shown = PAYMENT_METHOD_LABELS[token] ?? token;
    if (!out.includes(shown)) out.push(shown);
  }
  return out.length ? out.join(", ") : EMPTY_VALUE;
}

/** Typed against the reason codes the canonical rule can produce, so adding a code there fails type-checking here. */
export const UNRECOGNIZED_REASON_LABELS: Record<UnrecognizedReasonCode, string> = {
  ORDER_DRAFT: "Đơn nháp, chưa hoàn thành",
  ORDER_RESERVED: "Đã giữ hàng, chưa hoàn thành",
  ORDER_NOT_FULLY_PAID: "Đã hoàn thành nhưng chưa thanh toán đủ",
  ORDER_LOST: "Đơn đã mất, không tính doanh thu",
};

/** The "Lý do chưa ghi nhận" cell. The canonical value is an object { code, label }: render its label, never the
 * object. Also safe for a bare code string, null, undefined and unknown shapes. */
export function unrecognizedReasonText(reason: unknown): string {
  if (reason === null || reason === undefined) return EMPTY_VALUE;
  if (typeof reason === "string") {
    const s = reason.trim();
    if (!s) return EMPTY_VALUE;
    return (UNRECOGNIZED_REASON_LABELS as Record<string, string>)[s] ?? "Chưa xác định lý do";
  }
  if (typeof reason === "object") {
    const r = reason as { code?: unknown; label?: unknown };
    const label = clean(r.label);
    if (label) return label;
    const byCode = typeof r.code === "string" ? (UNRECOGNIZED_REASON_LABELS as Record<string, string>)[r.code] : undefined;
    return byCode ?? "Chưa xác định lý do";
  }
  return "Chưa xác định lý do";
}
