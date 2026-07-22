"use client";

import { Product } from "@/types/product";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CreatableSelect from "@/components/ui/CreatableSelect";
import { Tag, Wallet, MapPin, FileText, Truck, Video, Scale, PackageCheck } from "lucide-react";
import { PRODUCT_STATUS } from "@/lib/product.constants";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { useTagOptions } from "@/lib/hooks/useTagOptions";
import { useBatchOptions } from "@/lib/hooks/useBatchOptions";

interface Props {
  product: Partial<Product>;
  setProduct: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  errors?: Record<string, string>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wide pt-2 first:pt-0">
      {children}
    </h3>
  );
}

/** Same field ("size"), different on-screen label depending on category -
 * per spec, the trigger values are the literal category names "Bracelet"/
 * "Ring" (not the Vietnamese display text), matching however Settings >
 * Danh mục sản phẩm ends up naming those categories. */
function sizeLabelFor(category?: string): string {
  if (category === "Bracelet") return "Ni tay";
  if (category === "Ring") return "Ni nhẫn";
  return "Kích thước";
}

export default function ProductForm({ product, setProduct, errors = {} }: Props) {
  const updateField = (field: keyof Product, value: string) => {
    setProduct({ ...product, [field]: value });
  };

  const updateNumberField = (field: keyof Product, value: string) => {
    setProduct({ ...product, [field]: value === "" ? undefined : Number(value) });
  };

  const categoryOptions = useMasterDataOptions("product_category", product.category);
  const sourceOptions = useMasterDataOptions("product_source", product.source);
  const salespersonOptions = useMasterDataOptions("salesperson", product.salesperson);
  const colorOptions = useMasterDataOptions("product_color", product.color);
  const batchOptions = useBatchOptions();
  const jadeGrade = useTagOptions("product_jade_grade", product.jade_grade);

  const sizeLabel = sizeLabelFor(product.category);

  return (
    <div className="space-y-4">
      <SectionTitle>Cơ bản</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="SKU"
          placeholder="VD: SKU-001"
          value={product.sku || ""}
          onChange={(e) => updateField("sku", e.target.value)}
        />
        <Input
          id="product-product_code"
          label="Mã sản phẩm *"
          placeholder="VD: SP001"
          value={product.product_code || ""}
          onChange={(e) => updateField("product_code", e.target.value)}
          error={errors.product_code}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="product-product_name"
          label="Tên sản phẩm *"
          placeholder="Nhập tên sản phẩm"
          value={product.product_name || ""}
          onChange={(e) => updateField("product_name", e.target.value)}
          error={errors.product_name}
          icon={<Tag className="w-4 h-4" />}
        />
        <Select
          label="Danh mục"
          placeholder="Chọn danh mục"
          options={categoryOptions}
          value={product.category || ""}
          onChange={(e) => updateField("category", e.target.value)}
        />
      </div>

      <Select
        label="Trạng thái"
        placeholder="Chọn trạng thái"
        options={PRODUCT_STATUS}
        value={product.status || ""}
        onChange={(e) => updateField("status", e.target.value)}
      />

      <SectionTitle>Kinh doanh</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="product-cost_price"
          label="Giá vốn (VNĐ)"
          type="number"
          placeholder="0"
          min={0}
          value={product.cost_price ?? ""}
          onChange={(e) => updateNumberField("cost_price", e.target.value)}
          icon={<Wallet className="w-4 h-4" />}
          error={errors.cost_price}
        />
        <Input
          id="product-sale_price"
          label="Giá bán (VNĐ)"
          type="number"
          placeholder="0"
          min={0}
          value={product.sale_price ?? ""}
          onChange={(e) => updateNumberField("sale_price", e.target.value)}
          icon={<Wallet className="w-4 h-4" />}
          error={errors.sale_price}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Nguồn hàng"
          placeholder="Chọn nguồn hàng"
          options={sourceOptions}
          value={product.source || ""}
          onChange={(e) => updateField("source", e.target.value)}
        />
        <Select
          label="Lô hàng (không bắt buộc)"
          placeholder="Không thuộc lô hàng nào"
          options={batchOptions}
          value={product.batch_id || ""}
          onChange={(e) => setProduct({ ...product, batch_id: e.target.value || null })}
        />
      </div>

      {!product.id && (
        <Input
          id="product-available"
          label="Tồn kho ban đầu"
          type="number"
          placeholder="1"
          min={0}
          value={product.available ?? ""}
          onChange={(e) => updateNumberField("available", e.target.value)}
          icon={<PackageCheck className="w-4 h-4" />}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="product-discount"
          label="Giảm giá (%)"
          type="number"
          placeholder="0"
          min={0}
          max={100}
          value={product.discount ?? ""}
          onChange={(e) => updateNumberField("discount", e.target.value)}
          error={errors.discount}
        />
        <Select
          label="Nhân viên bán hàng"
          placeholder="Chọn nhân viên"
          options={salespersonOptions}
          value={product.salesperson || ""}
          onChange={(e) => updateField("salesperson", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Vị trí lưu kho"
          placeholder="VD: Tủ A - Ngăn 2"
          value={product.location || ""}
          onChange={(e) => updateField("location", e.target.value)}
          icon={<MapPin className="w-4 h-4" />}
        />
        <Input
          label="Số chứng nhận"
          placeholder="VD: GIA-123456"
          value={product.certificate_no || ""}
          onChange={(e) => updateField("certificate_no", e.target.value)}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      <Input
        label="Nhà cung cấp"
        placeholder="Tên nhà cung cấp"
        value={product.supplier || ""}
        onChange={(e) => updateField("supplier", e.target.value)}
        icon={<Truck className="w-4 h-4" />}
      />

      <SectionTitle>Thông tin sản phẩm</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Màu sắc"
          placeholder="Chọn màu sắc"
          options={colorOptions}
          value={product.color || ""}
          onChange={(e) => updateField("color", e.target.value)}
        />
        <Input
          id="product-size"
          label={sizeLabel}
          type="number"
          placeholder="VD: 54 hoặc 17.5"
          min={0}
          value={product.size ?? ""}
          onChange={(e) => updateNumberField("size", e.target.value)}
          error={errors.size}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="product-weight"
          label="Trọng lượng (g)"
          type="number"
          placeholder="VD: 25.5"
          min={0}
          value={product.weight ?? ""}
          onChange={(e) => updateNumberField("weight", e.target.value)}
          icon={<Scale className="w-4 h-4" />}
          error={errors.weight}
        />
        <CreatableSelect
          label="Cấp độ ngọc"
          placeholder="Nhập hoặc chọn cấp độ..."
          options={jadeGrade.options}
          value={product.jade_grade || ""}
          onChange={(value) => updateField("jade_grade", value)}
          onCreate={jadeGrade.createOption}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Ghi chú</label>
        <textarea
          placeholder="Ghi chú về sản phẩm..."
          value={product.notes || ""}
          onChange={(e) => updateField("notes", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <SectionTitle>Video</SectionTitle>

      {!product.id && (
        <p className="text-xs text-muted-foreground -mt-2">
          Ảnh sản phẩm được quản lý ở trang chi tiết sau khi lưu sản phẩm này.
        </p>
      )}

      <Input
        label="Video (URL)"
        placeholder="https://..."
        value={product.video || ""}
        onChange={(e) => updateField("video", e.target.value)}
        icon={<Video className="w-4 h-4" />}
      />
    </div>
  );
}
