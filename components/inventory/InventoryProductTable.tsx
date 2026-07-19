"use client";

import { Product } from "@/types/product";
import { AlertTriangle, Gem, ImageOff, MapPin, PackageSearch } from "lucide-react";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import { coverImageUrl } from "@/lib/productImage.service";
import { ProductOrderLink, deriveAvailability, verifyProduct } from "@/lib/inventory.service";
import Badge from "@/components/ui/Badge";

interface Props {
  products: Product[];
  orderLinks: Record<string, ProductOrderLink[]>;
  onSelect: (product: Product) => void;
  isLoading?: boolean;
}

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Có thể bán",
  reserved: "Đang giữ",
  unavailable: "Không sẵn có",
};

const AVAILABILITY_VARIANT: Record<string, "success" | "warning" | "muted"> = {
  available: "success",
  reserved: "warning",
  unavailable: "muted",
};

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

/** Read-only - no Edit/Delete anywhere (Spec: Explicitly Out of Scope).
 * Row click opens the Product Detail Drawer, never a route (UI §1.1/§1.6). */
export default function InventoryProductTable({
  products,
  orderLinks,
  onSelect,
  isLoading = false,
}: Props) {
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
        <p className="text-muted-foreground text-sm">Không tìm thấy sản phẩm phù hợp</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sản phẩm
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Danh mục
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trạng thái
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tình trạng
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Lô hàng
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Vị trí
            </th>
            <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Giá bán
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const links = orderLinks[product.id || ""] || [];
            const availability = deriveAvailability(product, links);
            const flags = verifyProduct(product, links);

            return (
            <tr
              key={product.id}
              onClick={() => onSelect(product)}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
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
                    <div className="font-medium text-foreground truncate">
                      {product.product_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{product.product_code}</div>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {product.category || "—"}
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
              <td className="px-5 py-3.5 text-sm">
                <div className="flex items-center gap-1.5">
                  <Badge variant={AVAILABILITY_VARIANT[availability]}>
                    {AVAILABILITY_LABEL[availability]}
                  </Badge>
                  {flags.length > 0 && (
                    <AlertTriangle
                      className="w-3.5 h-3.5 text-amber-600 shrink-0"
                      aria-label={flags.map((f) => f.reason).join(" ")}
                    />
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {product.batch?.batch_code || "—"}
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {product.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {product.location}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-5 py-3.5 text-sm text-right font-medium text-foreground">
                {typeof product.sale_price === "number" ? currency.format(product.sale_price) : "—"}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
