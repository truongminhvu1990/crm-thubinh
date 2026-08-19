"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { getCustomers } from "@/lib/customer.service";
import { getProducts } from "@/lib/product.service";
import { Customer } from "@/types/customer";
import { Product } from "@/types/product";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";

/** Receive Consignment (D9/D10, LOCKED) — Consignor = an existing Customer,
 * no new identity entity; the item is an existing Product, referenced by
 * the new Consignment layer, not a field added to Product. Search pattern
 * mirrors app/orders/new/page.tsx's own Customer/Product picker exactly
 * (getCustomers/getProducts, client-side, same as every other module that
 * references these two entities). */
export default function ReceiveConsignmentPage() {
  const router = useRouter();

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCustomerSearch(value: string) {
    setCustomerSearch(value);
    setSelectedCustomer(null);
    if (!value) {
      setCustomerResults([]);
      return;
    }
    setCustomerResults(await getCustomers(value));
  }

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.full_name);
    setCustomerResults([]);
  }

  async function handleProductSearch(value: string) {
    setProductSearch(value);
    setSelectedProduct(null);
    if (!value) {
      setProductResults([]);
      return;
    }
    // Available only — a consigned item, like any other Product, must be
    // Available before it can be referenced by anything that leads toward
    // a sale; this does not touch or infer Consignment Status (D01/D07
    // non-interference), it only avoids picking an already Sold/Reserved/
    // Archived Product.
    setProductResults(await getProducts(value, undefined, "Available"));
  }

  function selectProduct(product: Product) {
    setSelectedProduct(product);
    setProductSearch(`${product.product_code} — ${product.product_name}`);
    setProductResults([]);
  }

  async function handleSave() {
    setFormError(null);
    if (!selectedCustomer) {
      setFormError("Vui lòng chọn khách hàng (Consignor)");
      return;
    }
    if (!selectedProduct) {
      setFormError("Vui lòng chọn sản phẩm");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/consignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: selectedCustomer.id, product_id: selectedProduct.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể tạo consignment");
      }
      const created = await res.json();
      router.push(`/consignments/${created.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="pb-8 max-w-2xl">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary mb-6 transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-primary/5"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại
      </button>

      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-6">Nhận hàng ký gửi</h1>

      <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-5">
        <div className="relative">
          <label className="block text-sm font-medium text-foreground mb-1.5">Khách hàng (Consignor) *</label>
          <SearchInput
            data-testid="consignment-customer-search"
            placeholder="Tìm theo tên, mã hoặc số điện thoại..."
            value={customerSearch}
            onChange={(e) => handleCustomerSearch(e.target.value)}
            onClear={() => handleCustomerSearch("")}
          />
          {customerResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/40"
                >
                  <span className="font-medium">{c.full_name}</span>{" "}
                  <span className="text-muted-foreground">· {c.customer_code} · {c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-foreground mb-1.5">Sản phẩm *</label>
          <SearchInput
            data-testid="consignment-product-search"
            placeholder="Tìm theo tên hoặc mã sản phẩm..."
            value={productSearch}
            onChange={(e) => handleProductSearch(e.target.value)}
            onClear={() => handleProductSearch("")}
          />
          {productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProduct(p)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/40"
                >
                  <span className="font-medium">{p.product_code}</span>{" "}
                  <span className="text-muted-foreground">· {p.product_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="secondary" onClick={() => router.back()} disabled={isSaving}>
            Hủy
          </Button>
          <Button data-testid="consignment-save-button" onClick={handleSave} isLoading={isSaving}>
            <Send className="w-4 h-4" />
            Nhận hàng
          </Button>
        </div>
      </div>
    </div>
  );
}
