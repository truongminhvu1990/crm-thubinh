"use client";

import { useState } from "react";
import Link from "next/link";
import { Edit2, Trash2, PackageSearch, AlertTriangle } from "lucide-react";
import { ProductBatch } from "@/types/productBatch";
import { BatchCounts } from "@/lib/productBatch.service";
import { BATCH_STATUS, labelFor } from "@/lib/product.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";

interface Props {
  batches: ProductBatch[];
  /** Lot List Overview KPI (Product Owner Authorization, 2026-08-20).
   * Keyed by batch id - a Lot with no entry here has no Product at all
   * (Case 9: every KPI renders as 0, not an error). */
  statsByBatchId: Map<string, BatchCounts>;
  onEdit: (batch: ProductBatch) => void;
  onDelete: (batch: ProductBatch) => void;
  isLoading?: boolean;
}

const EMPTY_COUNTS: BatchCounts = { total: 0, sold: 0, returned: 0, remaining: 0, reserved: 0 };

function isOverdue(batch: ProductBatch): boolean {
  if (batch.status !== "active" || !batch.return_due_date) return false;
  return batch.return_due_date < new Date().toISOString().slice(0, 10);
}

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive"> = {
  active: "success",
  closed: "muted",
  returned: "destructive",
};

export default function BatchTable({ batches, statsByBatchId, onEdit, onDelete, isLoading = false }: Props) {
  const [pendingDelete, setPendingDelete] = useState<ProductBatch | null>(null);

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
        <p className="text-muted-foreground text-sm">Chưa có lô hàng nào</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table className="w-full min-w-[1040px]">
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
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tổng SP
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Đã bán
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Đã trả NCC
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Còn lại
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Trạng thái
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => {
              const counts = statsByBatchId.get(batch.id!) || EMPTY_COUNTS;
              return (
                <tr
                  key={batch.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/batches/${batch.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {batch.batch_code}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{batch.supplier || "—"}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">
                    {batch.received_date ? formatDate(batch.received_date) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    {batch.return_due_date ? (
                      <span
                        className={
                          isOverdue(batch) ? "text-destructive font-medium flex items-center gap-1" : "text-muted-foreground"
                        }
                      >
                        {isOverdue(batch) && <AlertTriangle className="w-3.5 h-3.5" />}
                        {formatDate(batch.return_due_date)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-testid={`batch-list-total-${batch.id}`} className="px-5 py-3.5 text-sm text-right text-foreground font-medium">
                    {counts.total}
                  </td>
                  <td data-testid={`batch-list-sold-${batch.id}`} className="px-5 py-3.5 text-sm text-right text-foreground">
                    {counts.sold}
                  </td>
                  <td data-testid={`batch-list-returned-${batch.id}`} className="px-5 py-3.5 text-sm text-right text-foreground">
                    {counts.returned}
                  </td>
                  <td data-testid={`batch-list-remaining-${batch.id}`} className="px-5 py-3.5 text-sm text-right text-foreground">
                    {counts.remaining}
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    <Badge variant={STATUS_VARIANT[batch.status || ""] || "muted"}>
                      {labelFor(BATCH_STATUS, batch.status) || batch.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(batch)}
                        className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
                        title="Chỉnh sửa"
                      >
                        <Edit2 className="w-4 h-4 text-primary" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(batch)}
                        className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile compact card list */}
      <div className="md:hidden space-y-2">
        {batches.map((batch) => {
          const counts = statsByBatchId.get(batch.id!) || EMPTY_COUNTS;
          return (
            <div key={batch.id} className="bg-card rounded-xl border border-border shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Link href={`/batches/${batch.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                  {batch.batch_code}
                </Link>
                <Badge variant={STATUS_VARIANT[batch.status || ""] || "muted"}>
                  {labelFor(BATCH_STATUS, batch.status) || batch.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-1">{batch.supplier || "—"}</p>
              <p className="text-xs text-muted-foreground mb-3">
                {batch.received_date ? `Nhận ${formatDate(batch.received_date)}` : "—"}
                {batch.return_due_date && (
                  <span className={isOverdue(batch) ? "text-destructive font-medium" : ""}>
                    {" · "}
                    {isOverdue(batch) && <AlertTriangle className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                    Hạn trả {formatDate(batch.return_due_date)}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
                <div>
                  <div className="font-semibold text-foreground">{counts.total}</div>
                  <div className="text-muted-foreground">Tổng SP</div>
                </div>
                <div>
                  <div className="font-semibold text-foreground">{counts.sold}</div>
                  <div className="text-muted-foreground">Đã bán</div>
                </div>
                <div>
                  <div className="font-semibold text-foreground">{counts.returned}</div>
                  <div className="text-muted-foreground">Trả NCC</div>
                </div>
                <div>
                  <div className="font-semibold text-foreground">{counts.remaining}</div>
                  <div className="text-muted-foreground">Còn lại</div>
                </div>
              </div>
              <div className="flex justify-end gap-1">
                <button onClick={() => onEdit(batch)} className="p-2 hover:bg-primary/10 rounded-lg transition-colors" title="Chỉnh sửa">
                  <Edit2 className="w-4 h-4 text-primary" />
                </button>
                <button
                  onClick={() => setPendingDelete(batch)}
                  className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                  title="Xóa"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        title="Xóa lô hàng?"
        description={
          pendingDelete
            ? `Bạn có chắc muốn xóa lô "${pendingDelete.batch_code}"? Sản phẩm thuộc lô này sẽ không bị xóa, chỉ gỡ liên kết lô hàng.`
            : undefined
        }
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
