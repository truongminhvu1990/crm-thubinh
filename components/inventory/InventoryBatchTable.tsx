"use client";

import { ProductBatch } from "@/types/productBatch";
import { AlertTriangle, PackageSearch } from "lucide-react";
import { BATCH_STATUS, labelFor } from "@/lib/product.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";

interface Props {
  batches: ProductBatch[];
  onSelect: (batch: ProductBatch) => void;
  isLoading?: boolean;
}

function isOverdue(batch: ProductBatch): boolean {
  if (batch.status !== "active" || !batch.return_due_date) return false;
  return batch.return_due_date < new Date().toISOString().slice(0, 10);
}

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive"> = {
  active: "success",
  closed: "muted",
  returned: "destructive",
};

/**
 * Read-only, no count/revenue/cost columns and no Edit/Delete anywhere
 * (Spec §5, UI §1.5 - no Dashboard/Summary/Charts). Clicking a batch always
 * drills into Inventory List filtered to that batch - never a Batch Detail
 * sub-view, never a link to the existing /batches/[id] page.
 */
export default function InventoryBatchTable({ batches, onSelect, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <PackageSearch className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Không tìm thấy lô hàng phù hợp</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Mã lô
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Nhà cung cấp
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ngày nhận
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Hạn trả
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr
              key={batch.id}
              onClick={() => onSelect(batch)}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <td className="px-5 py-3.5 font-medium text-foreground">{batch.batch_code}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {batch.supplier || "—"}
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {batch.received_date ? formatDate(batch.received_date) : "—"}
              </td>
              <td className="px-5 py-3.5 text-sm">
                {batch.return_due_date ? (
                  <span
                    className={
                      isOverdue(batch)
                        ? "text-destructive font-medium flex items-center gap-1"
                        : "text-muted-foreground"
                    }
                  >
                    {isOverdue(batch) && <AlertTriangle className="w-3.5 h-3.5" />}
                    {formatDate(batch.return_due_date)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-5 py-3.5 text-sm">
                <Badge variant={STATUS_VARIANT[batch.status || ""] || "muted"}>
                  {labelFor(BATCH_STATUS, batch.status) || batch.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
