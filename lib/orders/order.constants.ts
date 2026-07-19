import { Option } from "@/lib/customer.constants";
import { OrderEventType } from "@/types/order";

export const ORDER_STATUS: Option[] = [
  { value: "Draft", label: "Nháp" },
  { value: "Reserved", label: "Đã giữ hàng" },
  { value: "Completed", label: "Hoàn thành" },
  { value: "Lost", label: "Đã mất" },
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
export const LOST_REASON_OPTIONS: Option[] = [
  { value: "Giá quá cao", label: "Giá quá cao" },
  { value: "Chọn mua nơi khác", label: "Chọn mua nơi khác" },
  { value: "Khách đổi ý", label: "Khách đổi ý" },
  { value: "Sản phẩm không còn hàng", label: "Sản phẩm không còn hàng" },
  { value: "Không liên lạc được với khách", label: "Không liên lạc được với khách" },
  { value: "Khác / Nhầm lẫn", label: "Khác / Nhầm lẫn" },
];
