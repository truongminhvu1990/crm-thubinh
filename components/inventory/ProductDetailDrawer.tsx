"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ImageOff, Package, Tag, UserCheck, Wallet, Calendar } from "lucide-react";
import { Product } from "@/types/product";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import InfoItem from "@/components/ui/InfoItem";

interface Props {
  product: Product | null;
  onClose: () => void;
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

/**
 * The only product-detail surface Inventory shows - always this Drawer,
 * never a route, never the Product Module's own Detail page (Spec §6,
 * UI §1.6 Revision 3). Field list is locked: Images, Batch, Source,
 * Sales Owner, Status, Price, Created At - no more, no fewer, no Orders
 * history. "Price" is locked to sale_price only (Product Owner Review) -
 * cost_price is never shown here.
 *
 * Reuses Radix Dialog (already a dependency, same as the centered Modal)
 * but styles Dialog.Content as a right-side slide-in panel instead of a
 * centered box - this codebase has no drawer/sheet primitive yet, flagged
 * in INVENTORY_UI.md §3 as a new UI pattern.
 */
export default function ProductDetailDrawer({ product, onClose }: Props) {
  const [activeImage, setActiveImage] = useState(0);

  const images = product?.images
    ? [...product.images].sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const current = images[activeImage] || images[0];

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
      setActiveImage(0);
    }
  }

  return (
    <Dialog.Root open={!!product} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-card border-l border-border shadow-xl
            flex flex-col
            data-[state=open]:animate-in data-[state=open]:slide-in-from-right
            data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
        >
          {product && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <Dialog.Title className="text-lg font-semibold text-foreground truncate pr-4">
                  {product.product_name}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors rounded-md p-1 shrink-0"
                    aria-label="Đóng"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div>
                  {current ? (
                    <img
                      src={current.image_url}
                      alt={product.product_name}
                      className="w-full aspect-square object-cover rounded-lg bg-muted border border-border"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-lg bg-muted border border-border flex items-center justify-center">
                      <ImageOff className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  {images.length > 1 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {images.map((img, i) => (
                        <button
                          key={img.id}
                          onClick={() => setActiveImage(i)}
                          className={`w-14 h-14 rounded-md overflow-hidden border shrink-0 ${
                            i === activeImage ? "border-primary ring-2 ring-primary/20" : "border-border"
                          }`}
                        >
                          <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">{product.product_code}</div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Trạng thái</p>
                  {product.status ? (
                    <Badge variant={STATUS_VARIANT[product.status] || "muted"}>
                      {labelFor(PRODUCT_STATUS, product.status) || product.status}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <InfoItem icon={<Package className="w-4 h-4" />} label="Lô hàng">
                    {product.batch?.batch_code || "—"}
                  </InfoItem>
                  <InfoItem icon={<Tag className="w-4 h-4" />} label="Nguồn hàng">
                    {product.source || "—"}
                  </InfoItem>
                  <InfoItem icon={<UserCheck className="w-4 h-4" />} label="Nhân viên bán hàng">
                    {product.salesperson || "—"}
                  </InfoItem>
                  <InfoItem icon={<Wallet className="w-4 h-4" />} label="Giá bán">
                    {typeof product.sale_price === "number"
                      ? currency.format(product.sale_price)
                      : "—"}
                  </InfoItem>
                  <InfoItem icon={<Calendar className="w-4 h-4" />} label="Ngày tạo">
                    {product.created_at ? formatDate(product.created_at) : "—"}
                  </InfoItem>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
