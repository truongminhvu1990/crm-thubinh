"use client";

import { useState } from "react";
import { Wallet, Calendar } from "lucide-react";
import { Product } from "@/types/product";
import { CustomerPurchase } from "@/types/purchase";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

interface Props {
  purchase: Partial<CustomerPurchase>;
  setPurchase: React.Dispatch<React.SetStateAction<Partial<CustomerPurchase>>>;
  products: Product[];
}

export default function PurchaseForm({ purchase, setPurchase, products }: Props) {
  // Once the user types a price by hand, product changes must never touch
  // it again - this flag is the single source of truth for that.
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false);

  const updateField = (field: keyof CustomerPurchase, value: string) => {
    setPurchase({ ...purchase, [field]: value });
  };

  function handleProductChange(productId: string) {
    const selected = products.find((p) => p.id === productId);
    const shouldAutoFillPrice =
      !priceManuallyEdited && typeof selected?.sale_price === "number";

    setPurchase({
      ...purchase,
      product_id: productId,
      ...(shouldAutoFillPrice ? { sale_price: selected!.sale_price } : {}),
    });
  }

  function handlePriceChange(value: string) {
    setPriceManuallyEdited(true);
    setPurchase({
      ...purchase,
      sale_price: value === "" ? undefined : Number(value),
    });
  }

  return (
    <div className="space-y-4">
      <Select
        label="Sản phẩm *"
        placeholder="Chọn sản phẩm"
        options={products.map((p) => ({
          value: p.id!,
          label: p.sku ? `${p.product_name} (${p.product_code} · ${p.sku})` : `${p.product_name} (${p.product_code})`,
        }))}
        value={purchase.product_id || ""}
        onChange={(e) => handleProductChange(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Giá bán (VNĐ) *"
          type="number"
          placeholder="0"
          value={purchase.sale_price ?? ""}
          onChange={(e) => handlePriceChange(e.target.value)}
          icon={<Wallet className="w-4 h-4" />}
        />
        <Input
          label="Ngày bán *"
          type="date"
          value={purchase.sale_date || ""}
          onChange={(e) => updateField("sale_date", e.target.value)}
          icon={<Calendar className="w-4 h-4" />}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Ghi chú</label>
        <textarea
          placeholder="Ghi chú thêm về giao dịch..."
          value={purchase.note || ""}
          onChange={(e) => updateField("note", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}
