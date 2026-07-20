"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, X, Download, Upload } from "lucide-react";
import { Product } from "@/types/product";
import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  findProductByCode,
  findProductBySku,
} from "@/lib/product.service";
import { buildProductImportTemplate } from "@/lib/productImportExport";
import { PRODUCT_STATUS } from "@/lib/product.constants";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import ProductTable from "@/components/product/ProductTable";
import ProductModal from "@/components/product/ProductModal";
import ProductImportModal from "@/components/product/ProductImportModal";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import AlertDialog from "@/components/ui/AlertDialog";

const EMPTY_PRODUCT: Partial<Product> = {
  product_code: "",
  product_name: "",
};

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [salespersonFilter, setSalespersonFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>(EMPTY_PRODUCT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [duplicateProduct, setDuplicateProduct] = useState<Product | null>(null);
  const [duplicateField, setDuplicateField] = useState<"product_code" | "sku">("product_code");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const sourceOptions = useMasterDataOptions("product_source");
  const salespersonOptions = useMasterDataOptions("salesperson");
  const categoryOptions = useMasterDataOptions("product_category");

  const hasActiveFilters =
    searchTerm !== "" ||
    categoryFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    sourceFilter !== "ALL" ||
    salespersonFilter !== "ALL";

  async function loadProducts() {
    setIsLoading(true);
    const data = await getProducts();
    setProducts(data);
    filterProducts(data, searchTerm, categoryFilter, statusFilter, sourceFilter, salespersonFilter);
    setIsLoading(false);
  }

  function filterProducts(
    data: Product[],
    search: string,
    category: string,
    status: string,
    source: string,
    salesperson: string
  ) {
    let filtered = data;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.product_name.toLowerCase().includes(searchLower) ||
          p.product_code.toLowerCase().includes(searchLower) ||
          (p.sku || "").toLowerCase().includes(searchLower) ||
          (p.certificate_no || "").toLowerCase().includes(searchLower) ||
          (p.supplier || "").toLowerCase().includes(searchLower) ||
          (p.notes || "").toLowerCase().includes(searchLower)
      );
    }

    if (category !== "ALL") {
      filtered = filtered.filter((p) => p.category === category);
    }

    if (status !== "ALL") {
      filtered = filtered.filter((p) => p.status === status);
    }

    if (source !== "ALL") {
      filtered = filtered.filter((p) => p.source === source);
    }

    if (salesperson !== "ALL") {
      filtered = filtered.filter((p) => p.salesperson === salesperson);
    }

    setFilteredProducts(filtered);
  }

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    filterProducts(products, value, categoryFilter, statusFilter, sourceFilter, salespersonFilter);
  }

  function handleCategoryChange(value: string) {
    setCategoryFilter(value);
    filterProducts(products, searchTerm, value, statusFilter, sourceFilter, salespersonFilter);
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    filterProducts(products, searchTerm, categoryFilter, value, sourceFilter, salespersonFilter);
  }

  function handleSourceChange(value: string) {
    setSourceFilter(value);
    filterProducts(products, searchTerm, categoryFilter, statusFilter, value, salespersonFilter);
  }

  function handleSalespersonChange(value: string) {
    setSalespersonFilter(value);
    filterProducts(products, searchTerm, categoryFilter, statusFilter, sourceFilter, value);
  }

  function handleClearFilters() {
    setSearchTerm("");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
    setSourceFilter("ALL");
    setSalespersonFilter("ALL");
    filterProducts(products, "", "ALL", "ALL", "ALL", "ALL");
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
    setIsLoading(true);
    try {
      if (isEditing && currentProduct.id) {
        const { error } = await updateProduct(currentProduct.id, currentProduct);
        if (error) throw error;
      } else {
        const { error } = await addProduct(currentProduct);
        if (error) throw error;
      }

      setModalOpen(false);
      setCurrentProduct(EMPTY_PRODUCT);
      setIsEditing(false);
      await loadProducts();
    } catch (error) {
      setFormError("Lỗi khi lưu sản phẩm");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveProduct() {
    const fieldErrors = validateProduct(currentProduct);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      focusFirstInvalidField(fieldErrors);
      return;
    }

    setErrors({});
    setFormError("");

    const duplicate = await findProductByCode(currentProduct.product_code!, currentProduct.id);
    if (duplicate) {
      setDuplicateField("product_code");
      setDuplicateProduct(duplicate);
      return;
    }

    if (currentProduct.sku) {
      const duplicateSku = await findProductBySku(currentProduct.sku, currentProduct.id);
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

  async function handleDownloadTemplate() {
    const blob = await buildProductImportTemplate();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-nhap-san-pham.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteProduct(product: Product) {
    setIsLoading(true);
    try {
      const error = await deleteProduct(product.id!);
      if (error) throw error;
      await loadProducts();
    } catch (error) {
      alert("Lỗi khi xóa sản phẩm");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleEditProduct(product: Product) {
    setCurrentProduct(product);
    setIsEditing(true);
    setErrors({});
    setFormError("");
    setModalOpen(true);
  }

  function handleAddProduct() {
    setCurrentProduct(EMPTY_PRODUCT);
    setIsEditing(false);
    setErrors({});
    setFormError("");
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setCurrentProduct(EMPTY_PRODUCT);
    setIsEditing(false);
    setErrors({});
    setFormError("");
  }

  useEffect(() => {
    loadProducts();
  }, []);

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          Sản phẩm
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {products.length} sản phẩm · Hiển thị {filteredProducts.length}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <SearchInput
              placeholder="Tìm theo tên, mã hoặc SKU..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onClear={() => handleSearchChange("")}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả danh mục</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả trạng thái</option>
              {PRODUCT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả nguồn hàng</option>
              {sourceOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={salespersonFilter}
              onChange={(e) => handleSalespersonChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả nhân viên</option>
              {salespersonOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <Button variant="secondary" size="md" onClick={handleClearFilters}>
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Xóa bộ lọc</span>
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={loadProducts}>
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Làm mới</span>
            </Button>
            <Button variant="secondary" size="md" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Tải mẫu Excel</span>
            </Button>
            <Button variant="secondary" size="md" onClick={() => setImportModalOpen(true)}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Nhập Excel</span>
            </Button>
            <Button variant="primary" size="md" onClick={handleAddProduct} className="whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Thêm sản phẩm
            </Button>
          </div>
        </div>
      </div>

      <ProductTable
        products={filteredProducts}
        onEdit={handleEditProduct}
        onDelete={handleDeleteProduct}
        isLoading={isLoading}
      />

      <ProductModal
        open={modalOpen}
        title={isEditing ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
        product={currentProduct}
        setProduct={setCurrentProduct}
        errors={errors}
        formError={formError}
        onSave={handleSaveProduct}
        onClose={handleCloseModal}
        isLoading={isLoading}
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

      <ProductImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={loadProducts}
      />
    </div>
  );
}
