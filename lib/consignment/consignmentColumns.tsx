import { ReactNode } from "react";
import Link from "next/link";
import { ConsignmentOverviewRow } from "@/types/consignmentOverview";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { consignmentStatusLabel } from "@/lib/consignment/consignment.constants";

export type ConsignmentColumnKey =
  | "product"
  | "consignor"
  | "receivedAt"
  | "holdingTime"
  | "status"
  | "buyer"
  | "saleDate"
  | "salesperson"
  | "salePrice"
  | "fee"
  | "customerPayable"
  | "customerPaid"
  | "customerOutstanding";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value === null ? "—" : currency.format(value);
}

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  RECEIVED: "muted",
  AVAILABLE_FOR_SALE: "warning",
  SOLD: "success",
  RETURNED: "destructive",
};

export interface ConsignmentColumnDef {
  key: ConsignmentColumnKey;
  label: string;
  headerAlign?: "left" | "right";
  renderCell: (row: ConsignmentOverviewRow) => ReactNode;
}

/** Single source of truth for the Consignment Overview table's column set
 * (Global Report Column Management, 2026-08-18) — every field here is
 * already fully specified in types/consignmentOverview.ts's own doc
 * comments (Reporting/Overview Gap resolution); this file only turns that
 * already-existing Read Model into individually hide/show/reorder-able
 * columns, it invents nothing new. */
export const CONSIGNMENT_COLUMNS: ConsignmentColumnDef[] = [
  {
    key: "product",
    label: "Sản phẩm",
    renderCell: (c) => (
      <>
        <Link href={`/consignments/${c.consignmentId}`} className="text-primary hover:underline font-medium" data-testid="consignment-row-link">
          {c.consignmentCode}
        </Link>
        <p className="text-xs text-muted-foreground font-normal">
          {c.productCode} · {c.productName}
        </p>
      </>
    ),
  },
  { key: "consignor", label: "Consignor", renderCell: (c) => <span className="text-foreground">{c.consignorName || "—"}</span> },
  { key: "receivedAt", label: "Ngày nhận", renderCell: (c) => <span className="text-muted-foreground">{formatDate(c.receivedAt)}</span> },
  { key: "holdingTime", label: "Thời gian giữ", renderCell: (c) => <span className="text-muted-foreground">{c.holdingDays} ngày</span> },
  {
    key: "status",
    label: "Trạng thái",
    renderCell: (c) => <Badge variant={STATUS_BADGE_VARIANT[c.status] ?? "muted"}>{consignmentStatusLabel(c.status)}</Badge>,
  },
  { key: "buyer", label: "Người mua", renderCell: (c) => <span className="text-muted-foreground">{c.buyerName ?? "—"}</span> },
  {
    key: "saleDate",
    label: "Ngày bán",
    renderCell: (c) => <span className="text-muted-foreground">{c.saleDate ? formatDate(c.saleDate) : "—"}</span>,
  },
  { key: "salesperson", label: "Nhân viên bán", renderCell: (c) => <span className="text-muted-foreground">{c.salesperson ?? "—"}</span> },
  {
    key: "salePrice",
    label: "Giá bán",
    headerAlign: "right",
    renderCell: (c) => <span className="block text-right text-foreground">{money(c.salePrice)}</span>,
  },
  {
    key: "fee",
    label: "Phí",
    headerAlign: "right",
    renderCell: (c) => <span className="block text-right text-muted-foreground">{money(c.fee)}</span>,
  },
  {
    key: "customerPayable",
    label: "Khách hàng nhận",
    headerAlign: "right",
    renderCell: (c) => <span className="block text-right font-medium text-foreground">{money(c.customerPayable)}</span>,
  },
  {
    key: "customerPaid",
    label: "Đã trả",
    headerAlign: "right",
    renderCell: (c) => <span className="block text-right text-success">{money(c.customerPaid)}</span>,
  },
  {
    key: "customerOutstanding",
    label: "Còn lại",
    headerAlign: "right",
    renderCell: (c) => <span className="block text-right font-medium text-destructive">{money(c.customerOutstanding)}</span>,
  },
];

export const DEFAULT_VISIBLE_CONSIGNMENT_COLUMNS: Set<ConsignmentColumnKey> = new Set(CONSIGNMENT_COLUMNS.map((c) => c.key));
