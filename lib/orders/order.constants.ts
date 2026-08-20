import { Option } from "@/lib/customer.constants";
import { OrderEventType } from "@/types/order";

export const ORDER_STATUS: Option[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Reserved", label: "Đã giữ hàng" },
  { value: "Completed", label: "Hoàn thành" },
  { value: "Lost", label: "Đã mất" },
  { value: "Cancelled", label: "Đã hủy" },
];

export const PAYMENT_STATUS: Option[] = [
  { value: "Unpaid", label: "Chưa thanh toán" },
  { value: "Partially Paid", label: "Thanh toán một phần" },
  { value: "Paid", label: "Đã thanh toán" },
];

type BadgeVariant = "success" | "warning" | "destructive" | "muted";

export const ORDER_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  Draft: "muted",
  Reserved: "warning",
  Completed: "success",
  Lost: "destructive",
  Cancelled: "destructive",
};

export const PAYMENT_STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  Unpaid: "destructive",
  "Partially Paid": "warning",
  Paid: "success",
};

export { labelFor } from "@/lib/customer.constants";

/** ORDERS_SPEC.md §8 — the fixed Order Event type picklist, verbatim. */
export const ORDER_EVENT_TYPES: OrderEventType[] = [
  "Order Created",
  "Product Added",
  "Product Removed",
  "Price Changed",
  "Payment Added",
  "Status Changed",
  "Sales Owner Reassigned",
  "Marked Lost",
];

/** ORDERS_SPEC.md §3, Revision 5: `OD-{YYYYMMDD}-{6-digit sequence}`, e.g. OD-20260711-000001. */
export const ORDER_NUMBER_PATTERN = /^OD-\d{8}-\d{6}$/;

/** ORDERS_SPEC.md §4/§16 — the fixed Lost Reason picklist, verbatim. The
 * `lost_reason` master-data category named in §16 doesn't exist yet (same
 * known, separately-tracked gap as `payment_method` — see AddPaymentModal),
 * so this is a static list rather than master-data-backed, matching that
 * same precedent rather than inventing new master-data infrastructure. */
/** Payment / Bank Account / Money-Debt domain redesign, Stage 3 (LOCKED
 * business decision) — the one payment_method value that requires a
 * Receiving Account selection. `payment_method` itself stays free-text,
 * business-configurable master data (no enum) — this is the single literal
 * this feature keys off of, matching every example in the locked design.
 *
 * KNOWN GAP, stated plainly: as of this implementation, Dev's actual
 * master_data(category='payment_method') content is ("ck", "ckh",
 * "tiền mặt") — none of which is literally "Bank Transfer". The Receiving
 * Account picker below is correctly built and will activate the moment a
 * payment_method value equal to exactly this string exists (a normal
 * Settings > Master Data action, not a code/schema change) — it simply
 * cannot be exercised through the real dropdown until then. Not silently
 * worked around with a guessed heuristic (e.g. "anything but cash") because
 * PayPal-style methods must also never require a Receiving Account, which
 * a heuristic can't safely distinguish from "ck"/"ckh" without inventing a
 * new marker this task wasn't authorized to add. */
export const BANK_TRANSFER_PAYMENT_METHOD = "Bank Transfer";

export const LOST_REASON_OPTIONS: Option[] = [
  { value: "Giá quá cao", label: "Giá quá cao" },
  { value: "Chọn mua nơi khác", label: "Chọn mua nơi khác" },
  { value: "Khách đổi ý", label: "Khách đổi ý" },
  { value: "Sản phẩm không còn hàng", label: "Sản phẩm không còn hàng" },
  { value: "Không liên lạc được với khách", label: "Không liên lạc được với khách" },
  { value: "Khác / Nhầm lẫn", label: "Khác / Nhầm lẫn" },
];
