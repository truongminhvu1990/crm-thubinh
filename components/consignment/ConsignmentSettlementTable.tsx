"use client";

import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { ConsignmentSettlement } from "@/types/consignmentSettlement";
import Badge from "@/components/ui/Badge";
import { consignmentSettlementStatusLabel } from "@/lib/consignment/consignmentSettlement.constants";
import {
  ConsignmentSettlementColumnKey,
  ConsignmentSettlementSortKey,
  SortDir,
  CONSIGNMENT_SETTLEMENT_COLUMNS,
  DEFAULT_VISIBLE_CONSIGNMENT_SETTLEMENT_COLUMNS,
} from "@/lib/consignment/consignmentSettlementColumns";

export type { ConsignmentSettlementSortKey, SortDir };

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

interface Props {
  settlements: ConsignmentSettlement[];
  isLoading?: boolean;
  sortKey: ConsignmentSettlementSortKey;
  sortDir: SortDir;
  onSort: (key: ConsignmentSettlementSortKey) => void;
  /** Global Report Column Management (2026-08-18). */
  visibleColumns?: Set<ConsignmentSettlementColumnKey>;
  columnOrder?: ConsignmentSettlementColumnKey[];
}

export default function ConsignmentSettlementTable({
  settlements,
  isLoading = false,
  sortKey,
  sortDir,
  onSort,
  visibleColumns = DEFAULT_VISIBLE_CONSIGNMENT_SETTLEMENT_COLUMNS,
  columnOrder = CONSIGNMENT_SETTLEMENT_COLUMNS.map((c) => c.key),
}: Props) {
  const byKey = new Map(CONSIGNMENT_SETTLEMENT_COLUMNS.map((c) => [c.key, c]));
  const orderedVisibleColumns = columnOrder.map((key) => byKey.get(key)).filter((c): c is NonNullable<typeof c> => !!c && visibleColumns.has(c.key));
  const headerCtx = { sortKey, sortDir, onSort };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (settlements.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <PackageSearch className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có consignment settlement nào</p>
      </div>
    );
  }

  return (
    <>
      <div className="lg:hidden space-y-3">
        {settlements.map((s) => (
          <Link
            key={s.id}
            href={`/consignment-settlements/${s.id}`}
            data-testid="consignment-settlement-mobile-row"
            className="block bg-card rounded-xl border border-border shadow-sm p-4 active:bg-muted/30 transition-colors touch-manipulation"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{s.settlement_code}</p>
                <p className="text-sm text-muted-foreground truncate">{s.customer?.full_name ?? "—"}</p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[s.status] ?? "muted"}>{consignmentSettlementStatusLabel(s.status)}</Badge>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm mt-2.5">
              <span className="text-muted-foreground">{s.items.length} financial record</span>
              <span className="font-semibold text-foreground">{currency.format(s.total_amount)}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="consignment-settlement-table" className="w-full min-w-[1200px]">
          <thead>
            <tr className="border-b border-border">
              {orderedVisibleColumns.map((c) => (
                <th key={c.key} className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {c.renderHeader ? c.renderHeader(headerCtx) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settlements.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                {orderedVisibleColumns.map((c) => (
                  <td key={c.key} className="px-5 py-3.5 text-sm">
                    {c.renderCell(s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
