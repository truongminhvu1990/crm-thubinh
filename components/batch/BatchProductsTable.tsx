"use client";

import { useState } from "react";
import Link from "next/link";
import { Undo2, ImageOff, PackageSearch } from "lucide-react";
import { Product } from "@/types/product";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";

interface Props {
  products: Product[];
  onReturnToSupplier: (product: Product) => void;
  isLoading?: boolean;
}

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "default"> = {
  Active: "success",
  Paused: "muted",
  Sold: "default",
  Discontinued: "destructive",
  Returned: "destructive",
};

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function BatchProductsTable({ products, onReturnToSupplier, isLoading = false }: Props) {
  const [pendingReturn, setPendingReturn] = useState<Product | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-card rounded-xl p-10 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <PackageSearch className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có sản phẩm nào thuộc lô này</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[720px]">
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
            <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Thao tác
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const canReturn = product.status === "Active" || product.status === "Paused";
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
