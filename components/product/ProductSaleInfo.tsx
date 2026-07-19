"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, Wallet, Calendar } from "lucide-react";
import { Product } from "@/types/product";
import { CustomerPurchase } from "@/types/purchase";
import { getPurchaseForProduct } from "@/lib/purchase.service";
import { formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import InfoItem from "@/components/ui/InfoItem";

interface Props {
  product: Product;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function ProductSaleInfo({ product }: Props) {
  const [purchase, setPurchase] = useState<CustomerPurchase | null | undefined>(undefined);

  useEffect(() => {
    if (!product.id || product.status !== "Sold") return;
    let ignore = false;
    getPurchaseForProduct(product.id).then((data) => {
      if (!ignore) setPurchase(data);
    });
    return () => {
      ignore = true;
    };
  }, [product.id, product.status]);

  if (product.status !== "Sold") return null;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Wallet className="w-5 h-5 text-primary" />
        Thông tin bán hàng
      </h2>

      {purchase === undefined ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin text-xl">⟳</div>
        </div>
      ) : !purchase ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Chưa tìm thấy giao dịch mua hàng cho sản phẩm này.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
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
        </div>
      )}
    </Card>
  );
}
