"use client";

import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { ConsignmentOverviewRow } from "@/types/consignmentOverview";
import Badge from "@/components/ui/Badge";
import { consignmentStatusLabel } from "@/lib/consignment/consignment.constants";
import { ConsignmentColumnKey, CONSIGNMENT_COLUMNS, DEFAULT_VISIBLE_CONSIGNMENT_COLUMNS } from "@/lib/consignment/consignmentColumns";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  RECEIVED: "muted",
  AVAILABLE_FOR_SALE: "warning",
  SOLD: "success",
  RETURNED: "destructive",
};

function money(value: number | null): string {
  return value === null ? "—" : currency.format(value);
}

interface Props {
  consignments: ConsignmentOverviewRow[];
  isLoading?: boolean;
  /** Global Report Column Management (2026-08-18). Defaults match this
   * table's pre-existing behavior (every column, natural order). */
  visibleColumns?: Set<ConsignmentColumnKey>;
  columnOrder?: ConsignmentColumnKey[];
}

export default function ConsignmentTable({
  consignments,
  isLoading = false,
  visibleColumns = DEFAULT_VISIBLE_CONSIGNMENT_COLUMNS,
  columnOrder = CONSIGNMENT_COLUMNS.map((c) => c.key),
}: Props) {
  const byKey = new Map(CONSIGNMENT_COLUMNS.map((c) => [c.key, c]));
  const orderedVisibleColumns = columnOrder.map((key) => byKey.get(key)).filter((c): c is NonNullable<typeof c> => !!c && visibleColumns.has(c.key));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (consignments.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <PackageOpen className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có consignment nào</p>
      </div>
    );
  }

  return (
    <>
      <div className="lg:hidden space-y-3">
        {consignments.map((c) => (
          <Link
            key={c.consignmentId}
            href={`/consignments/${c.consignmentId}`}
            data-testid="consignment-mobile-row"
            className="block bg-card rounded-xl border border-border shadow-sm p-4 active:bg-muted/30 transition-colors touch-manipulation"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{c.consignmentCode}</p>
                <p className="text-sm text-muted-foreground truncate">{c.consignorName || "—"}</p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[c.status] ?? "muted"}>{consignmentStatusLabel(c.status)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2.5 truncate">
              {c.productCode} · {c.productName}
            </p>
            <div className="flex items-center justify-between gap-3 text-sm mt-2">
              <span className="text-muted-foreground">Giữ {c.holdingDays} ngày</span>
              {c.customerPayable !== null && <span className="font-semibold text-foreground">{money(c.customerPayable)}</span>}
            </div>
            {c.status === "SOLD" && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                Bán cho {c.buyerName ?? "—"} · {c.salesperson ?? "—"}
              </p>
            )}
          </Link>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="consignment-table" className="w-full min-w-[1600px]">
          <thead>
            <tr className="border-b border-border">
              {orderedVisibleColumns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                    c.headerAlign === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consignments.map((c) => (
              <tr key={c.consignmentId} className="border-b border-border last:border-0 hover:bg-muted/30">
                {orderedVisibleColumns.map((col) => (
                  <td key={col.key} className="px-4 py-3.5 text-sm">
                    {col.renderCell(c)}
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
