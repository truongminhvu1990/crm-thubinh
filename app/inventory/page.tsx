"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Product } from "@/types/product";
import { ProductBatch } from "@/types/productBatch";
import { getProducts } from "@/lib/product.service";
import { getBatches } from "@/lib/productBatch.service";
import { PRODUCT_STATUS } from "@/lib/product.constants";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { useBatchOptions } from "@/lib/hooks/useBatchOptions";
import {
  computeInventoryStats,
  getProductOrderLinks,
  verifyProduct,
  ProductOrderLink,
} from "@/lib/inventory.service";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import InventoryStatsCards from "@/components/inventory/InventoryStatsCards";
import InventoryProductTable from "@/components/inventory/InventoryProductTable";
import InventoryBatchTable from "@/components/inventory/InventoryBatchTable";
import ProductDetailDrawer from "@/components/inventory/ProductDetailDrawer";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";

const ALL = "ALL";

/**
 * Phase 1, read-only (docs/INVENTORY_SPEC.md Revision 2 + docs/INVENTORY_UI.md
 * Revision 3, both LOCKED). Two pages under this module - Inventory List and
 * Batch View - presented as tabs of this single route, with the Product
 * Detail Drawer as an overlay on top of either (never a third page/route).
 * No edit/delete/reserve/sell/Orders control exists anywhere. Never reads
 * products.available/reserved/sold - status is the only stock signal.
 */
export default function InventoryPage() {
  const [tab, setTab] = useState<"list" | "batches">("list");

  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [batchFilter, setBatchFilter] = useState(ALL);
  const [originFilter, setOriginFilter] = useState(ALL);
  const [salesOwnerFilter, setSalesOwnerFilter] = useState(ALL);

  const [batchSearchTerm, setBatchSearchTerm] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [orderLinks, setOrderLinks] = useState<Record<string, ProductOrderLink[]>>({});
  const [verificationOnly, setVerificationOnly] = useState(false);

  const categoryOptions = useMasterDataOptions("product_category");
  const salesOwnerOptions = useMasterDataOptions("salesperson");
  const batchOptions = useBatchOptions();

  async function loadProducts() {
    setIsLoadingProducts(true);
    const data = await getProducts();
    setProducts(data);
    const ids = data.map((p) => p.id).filter((id): id is string => !!id);
    setOrderLinks(await getProductOrderLinks(ids));
    setIsLoadingProducts(false);
  }

  async function loadBatches() {
    setIsLoadingBatches(true);
    const data = await getBatches();
    setBatches(data);
    setIsLoadingBatches(false);
  }

  useEffect(() => {
    loadProducts();
    loadBatches();
  }, []);

  const originOptions = useMemo(() => {
    const values = new Set(
      products.map((p) => p.origin).filter((v): v is string => !!v)
    );
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.product_name.toLowerCase().includes(q) ||
          p.product_code.toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q) ||
          (p.certificate_no || "").toLowerCase().includes(q)
      );
    }

    if (statusFilter !== ALL) filtered = filtered.filter((p) => p.status === statusFilter);
    if (categoryFilter !== ALL) filtered = filtered.filter((p) => p.category === categoryFilter);
    if (batchFilter !== ALL) filtered = filtered.filter((p) => p.batch_id === batchFilter);
    if (originFilter !== ALL) filtered = filtered.filter((p) => p.origin === originFilter);
    if (salesOwnerFilter !== ALL) filtered = filtered.filter((p) => p.salesperson === salesOwnerFilter);
    if (verificationOnly) {
      filtered = filtered.filter((p) => verifyProduct(p, orderLinks[p.id || ""] || []).length > 0);
    }

    return filtered;
  }, [
    products,
    searchTerm,
    statusFilter,
    categoryFilter,
    batchFilter,
    originFilter,
    salesOwnerFilter,
    verificationOnly,
    orderLinks,
  ]);

  // Inventory Verification (Product Owner Decision, not spec-locked - see
  // Self Review): counts.status vs Orders history mismatches across the
  // full, unfiltered product set, same "always full inventory" convention
  // as Statistics.
  const verificationCount = useMemo(
    () => products.filter((p) => verifyProduct(p, orderLinks[p.id || ""] || []).length > 0).length,
    [products, orderLinks]
  );

  const filteredBatches = useMemo(() => {
    if (!batchSearchTerm) return batches;
    const q = batchSearchTerm.toLowerCase();
    return batches.filter(
      (b) => b.batch_code.toLowerCase().includes(q) || (b.supplier || "").toLowerCase().includes(q)
    );
  }, [batches, batchSearchTerm]);

  // Locked: always the full, unfiltered inventory - never respects the
  // active Search/Filter selection (Product Owner Review).
  const stats = useMemo(() => computeInventoryStats(products, batches), [products, batches]);

  function handleSelectBatch(batch: ProductBatch) {
    setSearchTerm("");
    setStatusFilter(ALL);
    setCategoryFilter(ALL);
    setOriginFilter(ALL);
    setSalesOwnerFilter(ALL);
    setBatchFilter(batch.id!);
    setTab("list");
  }

  function handleRefresh() {
    loadProducts();
    loadBatches();
  }

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Tồn kho</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {tab === "list"
            ? `${products.length} sản phẩm · Hiển thị ${filteredProducts.length}`
            : `${batches.length} lô hàng · Hiển thị ${filteredBatches.length}`}
        </p>
      </div>

      <InventoryStatsCards stats={stats} />

      {verificationCount > 0 && (
        <button
          onClick={() => {
            setTab("list");
            setVerificationOnly((v) => !v);
          }}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-xl border px-4 py-3 mb-6 text-left text-sm transition-colors",
            verificationOnly
              ? "border-amber-400 bg-amber-100 text-amber-900"
              : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
          )}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            <strong>{verificationCount}</strong> sản phẩm có trạng thái chưa khớp với lịch sử đơn
            hàng — cần kiểm tra.
          </span>
          <span className="text-xs font-medium underline underline-offset-2 shrink-0">
            {verificationOnly ? "Bỏ lọc" : "Xem danh sách"}
          </span>
        </button>
      )}

      <div className="flex items-center gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setTab("list")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "list"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Sản phẩm
        </button>
        <button
          onClick={() => setTab("batches")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "batches"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Lô hàng
        </button>
      </div>

      {tab === "list" ? (
        <>
          <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 min-w-0">
                <SearchInput
                  placeholder="Tìm theo tên, mã, SKU hoặc số chứng nhận..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClear={() => setSearchTerm("")}
                />
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value={ALL}>Tất cả trạng thái</option>
                  {PRODUCT_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value={ALL}>Tất cả danh mục</option>
                  {categoryOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value={ALL}>Tất cả lô hàng</option>
                  {batchOptions.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>

                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value={ALL}>Tất cả nguồn gốc</option>
                  {originOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <select
                  value={salesOwnerFilter}
                  onChange={(e) => setSalesOwnerFilter(e.target.value)}
                  className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value={ALL}>Tất cả nhân viên</option>
                  {salesOwnerOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <Button variant="secondary" size="md" onClick={handleRefresh}>
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Làm mới</span>
                </Button>
              </div>
            </div>
          </div>

          <InventoryProductTable
            products={filteredProducts}
            orderLinks={orderLinks}
            onSelect={setSelectedProduct}
            isLoading={isLoadingProducts}
          />
        </>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 min-w-0">
                <SearchInput
                  placeholder="Tìm theo mã lô hoặc nhà cung cấp..."
                  value={batchSearchTerm}
                  onChange={(e) => setBatchSearchTerm(e.target.value)}
                  onClear={() => setBatchSearchTerm("")}
                />
              </div>
              <Button variant="secondary" size="md" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Làm mới</span>
              </Button>
            </div>
          </div>

          <InventoryBatchTable
            batches={filteredBatches}
            onSelect={handleSelectBatch}
            isLoading={isLoadingBatches}
          />
        </>
      )}

      <ProductDetailDrawer product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
