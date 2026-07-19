"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Product } from "@/types/product";
import { ProductImage } from "@/types/productImage";
import { getProductById, updateProduct, findProductByCode, findProductBySku } from "@/lib/product.service";
import { coverImageUrl } from "@/lib/productImage.service";
import { formatDate } from "@/lib/utils";
import Button from "@/components/ui/Button";
import AlertDialog from "@/components/ui/AlertDialog";
import ProductModal from "@/components/product/ProductModal";
import ProductProfileHeader from "@/components/product/ProductProfileHeader";
import ProductBusinessInfo from "@/components/product/ProductBusinessInfo";
import ProductInventory from "@/components/product/ProductInventory";
import ProductImageManager from "@/components/product/ProductImageManager";
import ProductMedia from "@/components/product/ProductMedia";
import ProductSaleInfo from "@/components/product/ProductSaleInfo";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editProduct, setEditProduct] = useState<Partial<Product>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [duplicateProduct, setDuplicateProduct] = useState<Product | null>(null);
  const [duplicateField, setDuplicateField] = useState<"product_code" | "sku">("product_code");

  async function loadProduct() {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await getProductById(id);
      setProduct(data);
      setEditProduct(data || {});
    } catch (error) {
      console.error("Failed to load product:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function validateProduct(product: Partial<Product>): Record<string, string> {
    const nextErrors: Record<string, string> = {};
    if (!product.product_code) nextErrors.product_code = "Vui lòng nhập mã sản phẩm";
    if (!product.product_name) nextErrors.product_name = "Vui lòng nhập tên sản phẩm";
    if (product.cost_price !== undefined && product.cost_price < 0)
      nextErrors.cost_price = "Giá vốn không được âm";
    if (product.sale_price !== undefined && product.sale_price < 0)
      nextErrors.sale_price = "Giá bán không được âm";
    if (product.weight !== undefined && product.weight < 0)
      nextErrors.weight = "Trọng lượng không được âm";
    if (product.size !== undefined && product.size < 0)
      nextErrors.size = "Kích thước không được âm";
    if (product.discount !== undefined && (product.discount < 0 || product.discount > 100))
      nextErrors.discount = "Giảm giá phải trong khoảng 0-100%";
    return nextErrors;
  }

  function focusFirstInvalidField(fieldErrors: Record<string, string>) {
    const firstField = [
      "product_code",
      "product_name",
      "cost_price",
      "sale_price",
      "size",
      "weight",
      "discount",
    ].find((f) => fieldErrors[f]);
    if (firstField) document.getElementById(`product-${firstField}`)?.focus();
  }

  async function performSaveProduct() {
    if (!product?.id) return;
    setIsSavingEdit(true);
    try {
      const { data, error } = await updateProduct(product.id, editProduct);
      if (error) throw error;
      if (data) {
        setProduct(data);
        setModalOpen(false);
      }
    } catch (error) {
      setFormError("Lỗi khi lưu thông tin sản phẩm");
      console.error(error);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleSaveProduct() {
    if (!product?.id) return;

    const fieldErrors = validateProduct(editProduct);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      focusFirstInvalidField(fieldErrors);
      return;
    }

    setErrors({});
    setFormError("");

    const duplicate = await findProductByCode(editProduct.product_code!, product.id);
    if (duplicate) {
      setDuplicateField("product_code");
      setDuplicateProduct(duplicate);
      return;
    }

    if (editProduct.sku) {
      const duplicateSku = await findProductBySku(editProduct.sku, product.id);
      if (duplicateSku) {
        setDuplicateField("sku");
        setDuplicateProduct(duplicateSku);
        return;
      }
    }

    await performSaveProduct();
  }

  function handleOpenDuplicateProfile() {
    if (duplicateProduct?.id) router.push(`/products/${duplicateProduct.id}`);
    setDuplicateProduct(null);
  }

  async function handleContinueCreate() {
    setDuplicateProduct(null);
    await performSaveProduct();
  }

  useEffect(() => {
    loadProduct();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy sản phẩm</p>
        <Button onClick={() => router.back()} className="mt-4">
          Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Quay lại
      </button>

      <div className="space-y-6">
        <ProductProfileHeader
          product={product}
          coverImageUrl={coverImageUrl({ images, image_url: product.image_url })}
          onEdit={() => {
            setEditProduct(product);
            setErrors({});
            setFormError("");
            setModalOpen(true);
          }}
        />

        <ProductInventory product={product} />

        <ProductSaleInfo product={product} />

        <ProductImageManager productId={product.id!} onChange={setImages} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProductBusinessInfo product={product} />
          <ProductMedia product={product} />
        </div>

        {(product.created_at || product.updated_at) && (
          <p className="text-xs text-muted-foreground text-center">
            {product.created_at && `Tạo lúc ${formatDate(product.created_at)}`}
            {product.created_at && product.updated_at && " · "}
            {product.updated_at && `Cập nhật lần cuối ${formatDate(product.updated_at)}`}
          </p>
        )}
      </div>

      <ProductModal
        open={modalOpen}
        title="Chỉnh sửa sản phẩm"
        product={editProduct}
        setProduct={setEditProduct}
        errors={errors}
        formError={formError}
        onSave={handleSaveProduct}
        onClose={() => {
          setModalOpen(false);
          setErrors({});
          setFormError("");
        }}
        isLoading={isSavingEdit}
      />

      <AlertDialog
        open={!!duplicateProduct}
        title={
          duplicateField === "sku"
            ? "Sản phẩm với SKU này đã tồn tại."
            : "Sản phẩm với mã này đã tồn tại."
        }
        confirmLabel="Tiếp tục tạo"
        cancelLabel="Mở sản phẩm"
        confirmVariant="primary"
        onOpenChange={(open) => !open && setDuplicateProduct(null)}
        onCancel={handleOpenDuplicateProfile}
        onConfirm={handleContinueCreate}
      />
    </div>
  );
}
