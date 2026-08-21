"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Undo2, ImageOff, PackageSearch } from "lucide-react";
import { Product } from "@/types/product";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";
import { formatDate } from "@/lib/utils";

interface Props {
  products: Product[];
  onReturnToSupplier: (product: Product) => void;
  isLoading?: boolean;
}

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "default"> = {
  Active: "success",
  Paused: "muted",
  Reserved: "muted",
  Sold: "default",
  Discontinued: "destructive",
  Returned: "destructive",
};

/** Lot Product-Level Status, D8 (LOCKED): "Còn lại" includes Reserved
 * (Decision 6) - this must match getBatchStats'/getBatchStaticReportData's
 * remaining = total - sold - returned formula exactly, or the filter tab
 * and the Lot Detail KPI cards would disagree about what "Còn lại" means. */
export type StatusFilter = "all" | "reserved" | "sold" | "returned" | "remaining";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "reserved", label: "Đang giữ đơn" },
  { key: "sold", label: "Đã bán" },
  { key: "returned", label: "Đã trả NCC" },
  { key: "remaining", label: "Còn lại" },
];

/** Return-to-Supplier eligibility (BR-003, LOCKED, 2026-08-21 - was
 * `status === "Active"`; guard semantics unchanged, matches
 * returnProductToSupplier()'s own `.in("status", ["Available", "Paused"])`
 * guard exactly). Exported for testing, same reasoning as matchesFilter()
 * above - no component-rendering test infrastructure in this repo. */
export function canReturnToSupplier(status: string | undefined): boolean {
  return status === "Available" || status === "Paused";
}

/** BR-003 (LOCKED, 2026-08-21): "returned"/"remaining" now key on
 * returned_at, not the retired status === "Returned" literal - identical
 * invariant to computeBatchCounts() (productBatch.service.ts) and
 * getBatchStaticReportData() (reports.service.ts). An Archived product
 * with returned_at NULL is never matched by "returned" and still counts
 * as "remaining" - status = Archived alone never means Returned. */
export function matchesFilter(product: Product, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "reserved":
      return product.status === "Reserved";
    case "sold":
      return product.status === "Sold";
    case "returned":
      return !!product.returned_at;
    case "remaining":
      return product.status !== "Sold" && !product.returned_at;
  }
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function BatchProductsTable({ products, onReturnToSupplier, isLoading = false }: Props) {
  const [pendingReturn, setPendingReturn] = useState<Product | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filteredProducts = useMemo(
    () => products.filter((p) => matchesFilter(p, filter)),
    [products, filter]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? "px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground"
                : "px-3 py-1.5 rounded-lg text-xs font-medium border border-input text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {products.length === 0 ? (
        <div className="bg-card rounded-xl p-10 text-center border border-border">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <PackageSearch className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Chưa có sản phẩm nào thuộc lô này</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-card rounded-xl p-10 text-center border border-border">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <PackageSearch className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Không có sản phẩm nào khớp bộ lọc này</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Sản phẩm
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Giá bán
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Trạng thái
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Ngày trả NCC
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const canReturn = canReturnToSupplier(product.status);
                return (
                  <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/products/${product.id}`} className="flex items-center gap-3">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.product_name}
                            className="w-10 h-10 rounded-lg object-cover bg-muted border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                            <ImageOff className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-foreground hover:text-primary transition-colors truncate">
                            {product.product_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{product.product_code}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-foreground">
                      {typeof product.sale_price === "number" ? currency.format(product.sale_price) : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm">
                      <Badge variant={STATUS_VARIANT[product.status || ""] || "muted"}>
                        {labelFor(PRODUCT_STATUS, product.status) || product.status || "—"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {product.returned_at ? formatDate(product.returned_at) : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {canReturn && (
                        <button
                          onClick={() => setPendingReturn(product)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-input hover:border-destructive hover:text-destructive transition-colors"
                          title="Trả về nhà cung cấp"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Trả về NCC
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog
        open={!!pendingReturn}
        title="Trả sản phẩm về nhà cung cấp?"
        description={
          pendingReturn
            ? `"${pendingReturn.product_name}" sẽ được đánh dấu là đã trả NCC. Sản phẩm không bị xóa, chỉ đổi trạng thái.`
            : undefined
        }
        confirmLabel="Trả về NCC"
        onOpenChange={(open) => !open && setPendingReturn(null)}
        onConfirm={() => {
          if (pendingReturn) onReturnToSupplier(pendingReturn);
          setPendingReturn(null);
        }}
      />
    </div>
  );
}
