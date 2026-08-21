"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ImageOff, Package, Tag, UserCheck, UserRound, Wallet, Calendar, Receipt } from "lucide-react";
import { Product } from "@/types/product";
import { CustomerPurchase } from "@/types/purchase";
import { getPurchaseForProduct } from "@/lib/purchase.service";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import { ORDER_STATUS, ORDER_STATUS_BADGE_VARIANT, labelFor as labelForOrder } from "@/lib/orders/order.constants";
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
  Available: "success",
  Paused: "muted",
  Sold: "default",
  Discontinued: "destructive",
  Archived: "muted",
};

/**
 * The only product-detail surface Inventory shows - always this Drawer,
 * never a route, never the Product Module's own Detail page (Spec §6,
 * UI §1.6 Revision 3 - field list originally locked to Images, Batch,
 * Source, Sales Owner, Status, Price, Created At, no Orders history.
 * "Price" is locked to sale_price only (Product Owner Review) - cost_price
 * is never shown here).
 *
 * Inventory -> Order -> Customer Traceability (Product Owner Authorization,
 * 2026-08-21) supersedes that lock: this Drawer now also fetches the same
 * purchase record ProductSaleInfo.tsx (Product Detail page) already shows,
 * via the same getPurchaseForProduct() call - no duplicated Order/Customer
 * SQL, and applyPurchaseHistoryVisibility()'s scoping (Owner/Manager/Sales/
 * Marketing) is inherited unchanged from that one call, never bypassed.
 * Giá bán/Nhân viên bán hàng prefer the purchase record's values once a
 * real sale exists (source of truth for "what actually happened"), falling
 * back to the raw product snapshot fields otherwise - see
 * resolveSaleTraceability().
 *
 * Reuses Radix Dialog (already a dependency, same as the centered Modal)
 * but styles Dialog.Content as a right-side slide-in panel instead of a
 * centered box - this codebase has no drawer/sheet primitive yet, flagged
 * in INVENTORY_UI.md §3 as a new UI pattern.
 */

export type SaleTraceability =
  | { kind: "no-sale" }
  | { kind: "direct-sale"; purchase: CustomerPurchase }
  | { kind: "order-sale"; purchase: CustomerPurchase; orderId: string; orderNumber: string; isCancelled: boolean };

/** Pure branch logic extracted for testing - this repo has no component-
 * rendering test infrastructure (no @testing-library/react/jsdom), so this
 * is the meaningful testable unit, same convention as BatchProductsTable's
 * exported matchesFilter(). A purchase with no order_item.order (legacy/
 * manually-entered, never went through the Orders module) is "direct-sale",
 * never treated as missing - see CustomerPurchase.order_item's own doc
 * comment in types/purchase.ts. */
export function resolveSaleTraceability(purchase: CustomerPurchase | null): SaleTraceability {
  if (!purchase) return { kind: "no-sale" };
  const order = purchase.order_item?.order ?? null;
  if (!order || !order.id) return { kind: "direct-sale", purchase };
  return {
    kind: "order-sale",
    purchase,
    orderId: order.id,
    orderNumber: order.order_number,
    isCancelled: order.order_status === "Cancelled",
  };
}

export default function ProductDetailDrawer({ product, onClose }: Props) {
  const [activeImage, setActiveImage] = useState(0);
  const [purchase, setPurchase] = useState<CustomerPurchase | null>(null);

  useEffect(() => {
    if (!product?.id) return;
    let ignore = false;
    getPurchaseForProduct(product.id).then((data) => {
      if (!ignore) setPurchase(data);
    });
    return () => {
      ignore = true;
    };
  }, [product?.id]);

  const traceability = resolveSaleTraceability(purchase);

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
                    {product.batch_id && product.batch ? (
                      <Link href={`/batches/${product.batch_id}`} className="text-primary hover:underline font-medium">
                        {product.batch.batch_code}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </InfoItem>
                  <InfoItem icon={<Tag className="w-4 h-4" />} label="Nguồn hàng">
                    {product.source || "—"}
                  </InfoItem>
                  <InfoItem icon={<UserCheck className="w-4 h-4" />} label="Nhân viên bán hàng">
                    {(traceability.kind !== "no-sale" ? traceability.purchase.salesperson : null) ||
                      product.salesperson ||
                      "—"}
                  </InfoItem>
                  <InfoItem icon={<Wallet className="w-4 h-4" />} label="Giá bán">
                    {(() => {
                      const price =
                        traceability.kind !== "no-sale" ? traceability.purchase.sale_price : product.sale_price;
                      return typeof price === "number" ? currency.format(price) : "—";
                    })()}
                  </InfoItem>
                  <InfoItem icon={<Calendar className="w-4 h-4" />} label="Ngày tạo">
                    {product.created_at ? formatDate(product.created_at) : "—"}
                  </InfoItem>
                </div>

                {traceability.kind !== "no-sale" && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-3">Thông tin bán hàng</p>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem icon={<Receipt className="w-4 h-4" />} label="Đơn hàng">
                        {traceability.kind === "order-sale" ? (
                          <span className="flex items-center gap-2 flex-wrap">
                            <Link href={`/orders/${traceability.orderId}`} className="text-primary hover:underline">
                              {traceability.orderNumber}
                            </Link>
                            {traceability.isCancelled && (
                              <Badge variant={ORDER_STATUS_BADGE_VARIANT["Cancelled"]}>
                                {labelForOrder(ORDER_STATUS, "Cancelled")}
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-normal">Bán trực tiếp (không qua Đơn hàng)</span>
                        )}
                      </InfoItem>

                      {traceability.purchase.customer && (
                        <InfoItem icon={<UserRound className="w-4 h-4" />} label="Khách hàng">
                          <Link
                            href={`/customers/${traceability.purchase.customer.id}`}
                            className="text-primary hover:underline"
                          >
                            {traceability.purchase.customer.full_name}
                          </Link>
                        </InfoItem>
                      )}

                      <InfoItem icon={<Calendar className="w-4 h-4" />} label="Ngày bán">
                        {formatDate(traceability.purchase.sale_date)}
                      </InfoItem>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
