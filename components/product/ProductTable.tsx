"use client";

import { useState } from "react";
import { Product } from "@/types/product";
import { Edit2, Trash2, Gem, ImageOff, PackageSearch } from "lucide-react";
import Link from "next/link";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import { coverImageUrl } from "@/lib/productImage.service";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";

interface Props {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  isLoading?: boolean;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "default"> = {
  Active: "success",
  Paused: "muted",
  Sold: "default",
  Discontinued: "destructive",
};

export default function ProductTable({
  products,
  onEdit,
  onDelete,
  isLoading = false,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <PackageSearch className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có sản phẩm nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[960px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sản phẩm
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Danh mục
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Giá bán
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tồn kho
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trạng thái
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Lô hàng
            </th>
            <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Thao tác
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr
              key={product.id}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
            >
              <td className="px-5 py-3.5">
                <Link href={`/products/${product.id}`} className="flex items-center gap-3">
                  {coverImageUrl(product) ? (
                    <img
                      src={coverImageUrl(product)}
                      alt={product.product_name}
                      className="w-11 h-11 rounded-lg object-cover bg-muted border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                      <ImageOff className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {product.product_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{product.product_code}</div>
                  </div>
                </Link>
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {product.category || "—"}
              </td>
              <td className="px-5 py-3.5 text-sm">
                <div className="font-medium text-foreground">
                  {typeof product.sale_price === "number" ? currency.format(product.sale_price) : "—"}
                </div>
                {!!product.discount && (
                  <div className="text-xs text-destructive">-{product.discount}%</div>
                )}
              </td>
              <td className="px-5 py-3.5 text-sm">
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="text-foreground font-medium">{product.available ?? 0}</span>
                  <span className="text-muted-foreground">có sẵn</span>
                  {!!product.reserved && (
                    <span className="text-amber-600">· {product.reserved} giữ</span>
                  )}
                  {!!product.sold && (
                    <span className="text-muted-foreground">· {product.sold} đã bán</span>
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm">
                {product.status ? (
                  <Badge variant={STATUS_VARIANT[product.status] || "muted"}>
                    {product.status === "Active" && <Gem className="w-3 h-3" />}
                    {labelFor(PRODUCT_STATUS, product.status) || product.status}
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {product.batch?.batch_code ? (
                  <Link
                    href={`/batches/${product.batch_id}`}
                    className="text-primary hover:underline"
                  >
                    {product.batch.batch_code}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-5 py-3.5">
                <div className="flex gap-1 justify-end opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(product)}
                    className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Edit2 className="w-4 h-4 text-primary" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(product)}
                    className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AlertDialog
        open={!!pendingDelete}
        title="Xóa sản phẩm?"
        description={
          pendingDelete
            ? `Bạn có chắc muốn xóa "${pendingDelete.product_name}"? Hành động này không thể hoàn tác.`
            : undefined
        }
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
