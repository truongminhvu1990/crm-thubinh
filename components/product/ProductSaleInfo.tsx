"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, Wallet, Calendar, Receipt } from "lucide-react";
import { Product } from "@/types/product";
import { CustomerPurchase } from "@/types/purchase";
import { getPurchaseForProduct } from "@/lib/purchase.service";
import { formatDate } from "@/lib/utils";
import { ORDER_STATUS, ORDER_STATUS_BADGE_VARIANT, labelFor } from "@/lib/orders/order.constants";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import InfoItem from "@/components/ui/InfoItem";

interface Props {
  product: Product;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/**
 * Inventory Traceability (Product Owner Authorization, 2026-08-20): shows
 * only when a customer_purchases row actually exists for this product - not
 * gated on product.status === "Sold", because a Cancelled order flips the
 * product's status back to Active/Returned while the historical purchase
 * (and its Order link) must keep showing. Renders nothing at all while
 * loading or when no purchase exists (Product Owner: don't render this card
 * just to say "chưa bán" - keep the unsold UI as-is).
 */
export default function ProductSaleInfo({ product }: Props) {
  const [purchase, setPurchase] = useState<CustomerPurchase | null>(null);

  useEffect(() => {
    if (!product.id) return;
    let ignore = false;
    getPurchaseForProduct(product.id).then((data) => {
      if (!ignore) setPurchase(data);
    });
    return () => {
      ignore = true;
    };
  }, [product.id]);

  if (!purchase) return null;

  const order = purchase.order_item?.order ?? null;
  const isCancelled = order?.order_status === "Cancelled";

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Wallet className="w-5 h-5 text-primary" />
        Thông tin bán hàng
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <InfoItem icon={<Receipt className="w-4 h-4" />} label="Đơn hàng">
          {order ? (
            <span className="flex items-center gap-2 flex-wrap">
              <Link href={`/orders/${order.id}`} className="text-primary hover:underline">
                {order.order_number}
              </Link>
              {isCancelled && (
                <Badge variant={ORDER_STATUS_BADGE_VARIANT[order.order_status]}>
                  {labelFor(ORDER_STATUS, order.order_status)}
                </Badge>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground font-normal">Bán trực tiếp (không qua Đơn hàng)</span>
          )}
        </InfoItem>

        {purchase.customer && (
          <InfoItem icon={<UserRound className="w-4 h-4" />} label="Khách hàng">
            <Link href={`/customers/${purchase.customer.id}`} className="text-primary hover:underline">
              {purchase.customer.full_name}
            </Link>
          </InfoItem>
        )}

        <InfoItem icon={<Wallet className="w-4 h-4" />} label="Giá bán">
          {currency.format(purchase.sale_price)}
        </InfoItem>

        <InfoItem icon={<Calendar className="w-4 h-4" />} label="Ngày bán">
          {formatDate(purchase.sale_date)}
        </InfoItem>

        {purchase.salesperson && (
          <InfoItem icon={<UserRound className="w-4 h-4" />} label="Nhân viên bán hàng">
            {purchase.salesperson}
          </InfoItem>
        )}
      </div>
    </Card>
  );
}
