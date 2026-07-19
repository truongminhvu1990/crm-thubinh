"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { getCustomers } from "@/lib/customer.service";
import { getProducts } from "@/lib/product.service";
import { Customer } from "@/types/customer";
import { Product } from "@/types/product";
import { calculateDiscountTotal, calculateSubtotal, calculateTotalAmount } from "@/lib/orders/order.rules";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchInput from "@/components/ui/SearchInput";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface CartLine {
  product: Product;
  snapshot_sale_price: number;
  discount: number;
  quantity: number;
  is_gift: boolean;
  gift_recipient_name: string;
  packaging_option: string;
}

/** Create Order (ORDERS_UI.md §4) — single scrolling screen. Step 4
 * (Payment) is deliberately omitted here: ORDERS_SPEC.md §2/§13 explicitly
 * allow skipping payment at creation ("save as Reserved/Unpaid to collect
 * payment later") — Add Payment already exists on Order Detail. */
export default function CreateOrderPage() {
  const router = useRouter();
  const salesOwnerOptions = useMasterDataOptions("salesperson");

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [salesOwner, setSalesOwner] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    if (!value) {
      setProductResults([]);
      return;
    }
    // Active is the only currently-trustworthy "sellable" signal (Inventory
    // Foundation Review: available/reserved/sold aren't wired to a real
    // write path yet) — filtering on it, not on those counters.
    setProductResults(await getProducts(value, undefined, "Active"));
  }

  function addToCart(product: Product) {
    if (cart.some((line) => line.product.id === product.id)) return;
    setCart([
      ...cart,
      {
        product,
        snapshot_sale_price: product.sale_price ?? 0,
        discount: product.discount ?? 0,
        quantity: 1,
        is_gift: false,
        gift_recipient_name: "",
        packaging_option: "",
      },
    ]);
    setProductSearch("");
    setProductResults([]);
  }

  function updateLine(index: number, changes: Partial<CartLine>) {
    setCart(cart.map((line, i) => (i === index ? { ...line, ...changes } : line)));
  }

  function removeLine(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  const subtotal = calculateSubtotal(cart);
  const discountTotal = calculateDiscountTotal(cart);
  const totalAmount = calculateTotalAmount(subtotal, discountTotal);

  async function handleSave() {
    setError(null);

    if (!selectedCustomer?.id) {
      setError("Vui lòng chọn khách hàng");
      return;
    }
    if (!salesOwner) {
      setError("Vui lòng chọn người phụ trách");
      return;
    }
    if (cart.length === 0) {
      setError("Vui lòng thêm ít nhất một sản phẩm");
      return;
    }

    setIsSaving(true);
    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          sales_owner: salesOwner,
          created_by: salesOwner,
        }),
      });
      if (!orderRes.ok) {
        const body = await orderRes.json().catch(() => ({}));
        throw new Error(body.error || "Không thể tạo đơn hàng");
      }
      const order = await orderRes.json();

      for (const line of cart) {
        const itemRes = await fetch(`/api/orders/${order.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: line.product.id,
            snapshot_sale_price: line.snapshot_sale_price,
            discount: line.discount,
            quantity: line.quantity,
            is_gift: line.is_gift,
            gift_recipient_name: line.is_gift ? line.gift_recipient_name || null : null,
            gift_note: null,
            packaging_option: line.packaging_option || null,
          }),
        });
        if (!itemRes.ok) {
          const body = await itemRes.json().catch(() => ({}));
          throw new Error(body.error || "Đã tạo đơn hàng nhưng không thể thêm sản phẩm");
        }
      }

      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
      setIsSaving(false);
    }
  }

  return (
    <div className="pb-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Tạo đơn hàng</h1>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>
      )}

      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Khách hàng</h2>
          <div className="relative">
            <SearchInput
              placeholder="Tìm theo tên hoặc số điện thoại..."
              value={customerSearch}
              onChange={(e) => handleCustomerSearch(e.target.value)}
              onClear={() => handleCustomerSearch("")}
            />
            {customerResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                  >
                    {customer.full_name} · {customer.phone}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <Select
              label="Người phụ trách *"
              placeholder="Chọn người phụ trách"
              options={salesOwnerOptions}
              value={salesOwner}
              onChange={(e) => setSalesOwner(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Chọn sản phẩm</h2>
          <div className="relative">
            <SearchInput
              placeholder="Tìm sản phẩm..."
              value={productSearch}
              onChange={(e) => handleProductSearch(e.target.value)}
              onClear={() => handleProductSearch("")}
            />
            {productResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {productResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                  >
                    <span>
                      {product.product_name} ({product.product_code})
                    </span>
                    <Plus className="w-4 h-4 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {productSearch && productResults.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">Không tìm thấy sản phẩm phù hợp</p>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Search className="w-5 h-5 mx-auto mb-2 opacity-50" />
              Tìm và chọn sản phẩm để thêm vào đơn hàng
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {cart.map((line, index) => (
                <div key={line.product.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="font-medium text-sm text-foreground">
                      {line.product.product_name} ({line.product.product_code})
                    </p>
                    <button
                      onClick={() => removeLine(index)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Xóa sản phẩm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Input
                      label="Giá bán"
                      type="number"
                      value={line.snapshot_sale_price}
                      onChange={(e) => updateLine(index, { snapshot_sale_price: Number(e.target.value) })}
                    />
                    <Input
                      label="Giảm giá"
                      type="number"
                      value={line.discount}
                      onChange={(e) => updateLine(index, { discount: Number(e.target.value) })}
                    />
                    <Input
                      label="Số lượng"
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: Math.max(1, Number(e.target.value)) })}
                    />
                    <Input
                      label="Đóng gói"
                      value={line.packaging_option}
                      onChange={(e) => updateLine(index, { packaging_option: e.target.value })}
                    />
                  </div>

                  <label className="flex items-center gap-2 mt-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={line.is_gift}
                      onChange={(e) => updateLine(index, { is_gift: e.target.checked })}
                    />
                    Là quà tặng
                  </label>
                  {line.is_gift && (
                    <div className="mt-2">
                      <Input
                        label="Tên người nhận quà"
                        value={line.gift_recipient_name}
                        onChange={(e) => updateLine(index, { gift_recipient_name: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính</span>
                <span>{currency.format(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Giảm giá</span>
                <span>{currency.format(discountTotal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-foreground text-base pt-1">
                <span>Tổng cộng</span>
                <span>{currency.format(totalAmount)}</span>
              </div>
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push("/orders")} disabled={isSaving}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
            Lưu đơn hàng
          </Button>
        </div>
      </div>
    </div>
  );
}
