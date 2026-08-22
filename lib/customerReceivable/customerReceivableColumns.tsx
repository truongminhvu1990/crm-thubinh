import { ReactNode } from "react";
import Link from "next/link";
import { CustomerReceivableRow } from "@/types/customerReceivable";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export type CustomerReceivableColumnKey =
  | "customer"
  | "orderNumber"
  | "orderDate"
  | "totalAmount"
  | "amountPaid"
  | "balance"
  | "status"
  | "paymentMethods"
  | "lastPaymentDate";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/** Same variant convention Phase C's OrderPaymentsList/Phase A-D's status
 * badges already use across this Finance Project - "warning" for both
 * Outstanding and Overpaid (attention-worthy, different reasons), "success"
 * for Settled. */
const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Outstanding: "warning",
  Settled: "success",
  Overpaid: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  Outstanding: "Còn nợ",
  Settled: "Đã thanh toán đủ",
  Overpaid: "Dư",
};

export interface CustomerReceivableColumnDef {
  key: CustomerReceivableColumnKey;
  label: string;
  headerAlign?: "left" | "right";
  renderCell: (row: CustomerReceivableRow) => ReactNode;
}

/** Single source of truth for Customer Receivable's column set (Global
 * Report Column Management, matching every other report in this
 * codebase). Order Number links to the existing Order Detail page
 * (/orders/[id]) rather than duplicating payment history/reference here -
 * see types/customerReceivable.ts's own doc comment for why. */
export const CUSTOMER_RECEIVABLE_COLUMNS: CustomerReceivableColumnDef[] = [
  {
    key: "customer",
    label: "Khách hàng",
    renderCell: (r) => (
      <Link href={`/customers/${r.customerId}`} className="text-primary hover:underline font-medium" data-testid="customer-receivable-customer-link">
        {r.customerName}
        <span className="block text-xs text-muted-foreground font-normal">{r.customerCode}</span>
      </Link>
    ),
  },
  {
    key: "orderNumber",
    label: "Đơn hàng",
    renderCell: (r) => (
      <Link href={`/orders/${r.orderId}`} className="text-primary hover:underline" data-testid="customer-receivable-order-link">
        {r.orderNumber}
      </Link>
    ),
  },
  {
    key: "orderDate",
    label: "Ngày đặt",
    renderCell: (r) => <span className="text-muted-foreground whitespace-nowrap">{formatDate(r.orderDate)}</span>,
  },
  {
    key: "totalAmount",
    label: "Tổng tiền",
    headerAlign: "right",
    renderCell: (r) => <span className="text-right block font-medium text-foreground whitespace-nowrap">{currency.format(r.totalAmount)}</span>,
  },
  {
    key: "amountPaid",
    label: "Đã thanh toán",
    headerAlign: "right",
    renderCell: (r) => <span className="text-right block text-muted-foreground whitespace-nowrap">{currency.format(r.amountPaid)}</span>,
  },
  {
    key: "balance",
    label: "Còn lại / Dư",
    headerAlign: "right",
    renderCell: (r) => (
      <span
        className={`text-right block font-medium whitespace-nowrap ${r.settlementState === "Overpaid" ? "text-amber-600" : "text-foreground"}`}
        data-testid={r.settlementState === "Overpaid" ? "customer-receivable-overpaid-amount" : undefined}
      >
        {r.settlementState === "Outstanding" && currency.format(r.remainingBalance)}
        {r.settlementState === "Settled" && "—"}
        {r.settlementState === "Overpaid" && `Dư ${currency.format(r.overpaidAmount)}`}
      </span>
    ),
  },
  {
    key: "status",
    label: "Trạng thái",
    renderCell: (r) => (
      <span data-testid={`customer-receivable-status-${r.settlementState}`}>
        <Badge variant={STATUS_BADGE_VARIANT[r.settlementState] ?? "muted"}>{STATUS_LABEL[r.settlementState] ?? r.settlementState}</Badge>
      </span>
    ),
  },
  {
    key: "paymentMethods",
    label: "Phương thức thanh toán",
    renderCell: (r) => <span className="text-muted-foreground whitespace-nowrap">{r.paymentMethods ?? "—"}</span>,
  },
  {
    key: "lastPaymentDate",
    label: "Thanh toán gần nhất",
    renderCell: (r) => (
      <span className="text-muted-foreground whitespace-nowrap">
        {r.lastPaymentDate ? `${formatDate(r.lastPaymentDate)} (${r.paymentCount})` : "—"}
      </span>
    ),
  },
];

export const DEFAULT_VISIBLE_CUSTOMER_RECEIVABLE_COLUMNS: Set<CustomerReceivableColumnKey> = new Set(
  CUSTOMER_RECEIVABLE_COLUMNS.map((c) => c.key)
);
