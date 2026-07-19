"use client";

import { Gem, ImageOff, Edit2, Ruler, Palette, Gauge, Scale, StickyNote } from "lucide-react";
import { Product } from "@/types/product";
import { PRODUCT_STATUS, labelFor } from "@/lib/product.constants";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import InfoItem from "@/components/ui/InfoItem";
import Badge from "@/components/ui/Badge";

interface Props {
  product: Product;
  onEdit: () => void;
  coverImageUrl?: string;
}

const STATUS_VARIANT: Record<string, "success" | "muted" | "destructive" | "default"> = {
  Active: "success",
  Paused: "muted",
  Sold: "default",
  Discontinued: "destructive",
};

function sizeLabelFor(category?: string): string {
  if (category === "Bracelet") return "Ni tay";
  if (category === "Ring") return "Ni nhẫn";
  return "Kích thước";
}

export default function ProductProfileHeader({ product, onEdit, coverImageUrl }: Props) {
  const displayImageUrl = coverImageUrl || product.image_url;

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          {displayImageUrl ? (
            <img
              src={displayImageUrl}
              alt={product.product_name}
              className="w-24 h-24 rounded-xl object-cover bg-muted shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <ImageOff className="w-8 h-8 text-muted-foreground/50" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{product.product_name}</h1>
              {product.status && (
                <Badge variant={STATUS_VARIANT[product.status] || "muted"} className="text-sm px-2.5 py-0.5">
                  {product.status === "Active" && <Gem className="w-3.5 h-3.5" />}
                  {labelFor(PRODUCT_STATUS, product.status) || product.status}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Mã: {product.product_code}
              {product.sku && ` · SKU: ${product.sku}`}
            </p>
          </div>
        </div>

        <Button variant="primary" onClick={onEdit}>
          <Edit2 className="w-4 h-4" />
          Chỉnh sửa
        </Button>
      </div>

      <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-5">
        {product.color && (
          <InfoItem icon={<Palette className="w-4 h-4" />} label="Màu sắc">
            {product.color}
          </InfoItem>
        )}

        {product.size !== undefined && product.size !== null && (
          <InfoItem icon={<Ruler className="w-4 h-4" />} label={sizeLabelFor(product.category)}>
            {product.size}
          </InfoItem>
        )}

        {typeof product.weight === "number" && (
          <InfoItem icon={<Scale className="w-4 h-4" />} label="Trọng lượng">
            {product.weight}g
          </InfoItem>
        )}

        {product.jade_grade && (
          <InfoItem icon={<Gauge className="w-4 h-4" />} label="Cấp độ ngọc">
            {product.jade_grade}
          </InfoItem>
        )}

        {product.notes && (
          <InfoItem icon={<StickyNote className="w-4 h-4" />} label="Ghi chú">
            {product.notes}
          </InfoItem>
        )}
      </div>
    </Card>
  );
}
