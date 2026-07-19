"use client";

import { Wallet, Percent, MapPin, FileText, Truck, Tag, UserCheck } from "lucide-react";
import { Product } from "@/types/product";
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

export default function ProductBusinessInfo({ product }: Props) {
  const hasAny =
    typeof product.cost_price === "number" ||
    typeof product.sale_price === "number" ||
    !!product.discount ||
    product.location ||
    product.certificate_no ||
    product.supplier ||
    product.source ||
    product.salesperson;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Wallet className="w-5 h-5" />
        Thông tin kinh doanh
      </h2>

      {!hasAny ? (
        <p className="text-sm text-muted-foreground text-center py-6">Chưa có thông tin kinh doanh.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {typeof product.cost_price === "number" && (
            <InfoItem icon={<Wallet className="w-4 h-4" />} label="Giá vốn">
              {currency.format(product.cost_price)}
            </InfoItem>
          )}

          {typeof product.sale_price === "number" && (
            <InfoItem icon={<Wallet className="w-4 h-4" />} label="Giá bán">
              {currency.format(product.sale_price)}
            </InfoItem>
          )}

          {!!product.discount && (
            <InfoItem icon={<Percent className="w-4 h-4" />} label="Giảm giá">
              {product.discount}%
            </InfoItem>
          )}

          {product.location && (
            <InfoItem icon={<MapPin className="w-4 h-4" />} label="Vị trí lưu kho">
              {product.location}
            </InfoItem>
          )}

          {product.certificate_no && (
            <InfoItem icon={<FileText className="w-4 h-4" />} label="Số chứng nhận">
              {product.certificate_no}
            </InfoItem>
          )}

          {product.supplier && (
            <InfoItem icon={<Truck className="w-4 h-4" />} label="Nhà cung cấp">
              {product.supplier}
            </InfoItem>
          )}

          {product.source && (
            <InfoItem icon={<Tag className="w-4 h-4" />} label="Nguồn hàng">
              {product.source}
            </InfoItem>
          )}

          {product.salesperson && (
            <InfoItem icon={<UserCheck className="w-4 h-4" />} label="Nhân viên bán hàng">
              {product.salesperson}
            </InfoItem>
          )}
        </div>
      )}
    </Card>
  );
}
