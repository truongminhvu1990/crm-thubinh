import { ReactNode } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Settlement } from "@/types/settlement";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { settlementStatusLabel } from "@/lib/settlement/settlement.constants";

export type SettlementColumnKey =
  | "code"
  | "partner"
  | "compensationCount"
  | "totalAmount"
  | "status"
  | "requestedAt"
  | "approvedAt"
  | "completedAt"
  | "createdAt";
export type SettlementSortKey = "created_at" | "requested_at";
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
  Paid: "success",
  Cancelled: "destructive",
};

export interface SettlementColumnContext {
  sortKey: SettlementSortKey;
  sortDir: SortDir;
  onSort: (key: SettlementSortKey) => void;
}

export interface SettlementColumnDef {
  key: SettlementColumnKey;
  label: string;
  renderHeader?: (ctx: SettlementColumnContext) => ReactNode;
  renderCell: (row: Settlement) => ReactNode;
}

function SortHeader({ label, sortKeyValue, ctx }: { label: string; sortKeyValue: SettlementSortKey; ctx: SettlementColumnContext }) {
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

/** Single source of truth for Settlement's column set (Global Report
 * Column Management, 2026-08-18). Compensation Count / Total Amount are
 * real (Settlement 1:N Settlement Items N:1 Compensation, Product Owner
 * Revision 2026-07-31, Decision 1) — `items.length` and the service-layer-
 * computed `total_amount` (Decision 4: always SUM(items), never a
 * stored/editable value). */
export const SETTLEMENT_COLUMNS: SettlementColumnDef[] = [
  {
    key: "code",
    label: "Mã",
    renderCell: (s) => (
      <Link href={`/settlements/${s.id}`} className="text-primary hover:underline font-medium" data-testid="settlement-row-link">
        {s.settlement_code}
      </Link>
    ),
  },
  { key: "partner", label: "Người nhận", renderCell: (s) => <span className="text-foreground">{s.partner?.name ?? "—"}</span> },
  { key: "compensationCount", label: "Số Compensation", renderCell: (s) => <span className="text-muted-foreground">{s.items.length}</span> },
  {
    key: "totalAmount",
    label: "Tổng số tiền",
    renderCell: (s) => <span className="font-medium text-foreground">{currency.format(s.total_amount)}</span>,
  },
  {
    key: "status",
    label: "Trạng thái",
    renderCell: (s) => <Badge variant={STATUS_BADGE_VARIANT[s.status] ?? "muted"}>{settlementStatusLabel(s.status)}</Badge>,
  },
  {
    key: "requestedAt",
    label: "Ngày yêu cầu",
    renderHeader: (ctx) => <SortHeader label="Ngày yêu cầu" sortKeyValue="requested_at" ctx={ctx} />,
    renderCell: (s) => <span className="text-muted-foreground">{s.requested_at ? formatDate(s.requested_at) : "—"}</span>,
  },
  {
    key: "approvedAt",
    label: "Ngày duyệt",
    renderCell: (s) => <span className="text-muted-foreground">{s.approved_at ? formatDate(s.approved_at) : "—"}</span>,
  },
  {
    key: "completedAt",
    label: "Ngày hoàn tất",
    renderCell: (s) => <span className="text-muted-foreground">{s.completed_at ? formatDate(s.completed_at) : "—"}</span>,
  },
  {
    key: "createdAt",
    label: "Ngày tạo",
    renderHeader: (ctx) => <SortHeader label="Ngày tạo" sortKeyValue="created_at" ctx={ctx} />,
    renderCell: (s) => <span className="text-muted-foreground">{s.created_at ? formatDate(s.created_at) : "—"}</span>,
  },
];

export const DEFAULT_VISIBLE_SETTLEMENT_COLUMNS: Set<SettlementColumnKey> = new Set(SETTLEMENT_COLUMNS.map((c) => c.key));
