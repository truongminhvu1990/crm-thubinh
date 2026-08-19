import { ReactNode } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { ConsignmentSettlement } from "@/types/consignmentSettlement";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { consignmentSettlementStatusLabel } from "@/lib/consignment/consignmentSettlement.constants";

export type ConsignmentSettlementColumnKey = "code" | "customer" | "itemCount" | "totalAmount" | "status" | "requestedAt" | "createdAt";
export type ConsignmentSettlementSortKey = "created_at" | "requested_at";
export type SortDir = "asc" | "desc";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Draft: "muted",
  Pending: "warning",
  Approved: "warning",
  Completed: "success",
  Cancelled: "destructive",
};

export interface ConsignmentSettlementColumnContext {
  sortKey: ConsignmentSettlementSortKey;
  sortDir: SortDir;
  onSort: (key: ConsignmentSettlementSortKey) => void;
}

export interface ConsignmentSettlementColumnDef {
  key: ConsignmentSettlementColumnKey;
  label: string;
  /** Only the two sortable date columns override this — restates the same
   * row-SORT affordance the table already had (Product Owner §13: order
   * and sort are different concerns, this table's existing sort behavior
   * is preserved verbatim, just relocated into the column def). */
  renderHeader?: (ctx: ConsignmentSettlementColumnContext) => ReactNode;
  renderCell: (row: ConsignmentSettlement) => ReactNode;
}

function SortHeader({ label, sortKeyValue, ctx }: { label: string; sortKeyValue: ConsignmentSettlementSortKey; ctx: ConsignmentSettlementColumnContext }) {
  const isActive = ctx.sortKey === sortKeyValue;
  const Icon = isActive ? (ctx.sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => ctx.onSort(sortKeyValue)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
    >
      {label}
      <Icon className={isActive ? "w-3 h-3 text-primary" : "w-3 h-3"} />
    </button>
  );
}

/** Single source of truth for Consignment Settlement's column set (Global
 * Report Column Management, 2026-08-18). */
export const CONSIGNMENT_SETTLEMENT_COLUMNS: ConsignmentSettlementColumnDef[] = [
  {
    key: "code",
    label: "Mã",
    renderCell: (s) => (
      <Link href={`/consignment-settlements/${s.id}`} className="text-primary hover:underline font-medium" data-testid="consignment-settlement-row-link">
        {s.settlement_code}
      </Link>
    ),
  },
  { key: "customer", label: "Khách hàng (Consignor)", renderCell: (s) => <span className="text-foreground">{s.customer?.full_name ?? "—"}</span> },
  { key: "itemCount", label: "Số Financial Record", renderCell: (s) => <span className="text-muted-foreground">{s.items.length}</span> },
  {
    key: "totalAmount",
    label: "Tổng số tiền",
    renderCell: (s) => <span className="font-medium text-foreground">{currency.format(s.total_amount)}</span>,
  },
  {
    key: "status",
    label: "Trạng thái",
    renderCell: (s) => <Badge variant={STATUS_BADGE_VARIANT[s.status] ?? "muted"}>{consignmentSettlementStatusLabel(s.status)}</Badge>,
  },
  {
    key: "requestedAt",
    label: "Ngày yêu cầu",
    renderHeader: (ctx) => <SortHeader label="Ngày yêu cầu" sortKeyValue="requested_at" ctx={ctx} />,
    renderCell: (s) => <span className="text-muted-foreground">{s.requested_at ? formatDate(s.requested_at) : "—"}</span>,
  },
  {
    key: "createdAt",
    label: "Ngày tạo",
    renderHeader: (ctx) => <SortHeader label="Ngày tạo" sortKeyValue="created_at" ctx={ctx} />,
    renderCell: (s) => <span className="text-muted-foreground">{s.created_at ? formatDate(s.created_at) : "—"}</span>,
  },
];

export const DEFAULT_VISIBLE_CONSIGNMENT_SETTLEMENT_COLUMNS: Set<ConsignmentSettlementColumnKey> = new Set(
  CONSIGNMENT_SETTLEMENT_COLUMNS.map((c) => c.key)
);
