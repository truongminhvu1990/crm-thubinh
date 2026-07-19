"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ShoppingBag, PackageOpen } from "lucide-react";
import { Customer } from "@/types/customer";
import { Product } from "@/types/product";
import { CustomerPurchase } from "@/types/purchase";
import { getPurchasesByCustomer, addPurchase, updatePurchase, deletePurchase } from "@/lib/purchase.service";
import { getProducts } from "@/lib/product.service";
import { formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AlertDialog from "@/components/ui/AlertDialog";
import PurchaseModal from "./PurchaseModal";

interface Props {
  customer: Customer;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const EMPTY_PURCHASE: Partial<CustomerPurchase> = {
  product_id: "",
  sale_price: undefined,
  sale_date: new Date().toISOString().slice(0, 10),
  note: "",
};

export default function CustomerPurchaseHistory({ customer }: Props) {
  const [purchases, setPurchases] = useState<CustomerPurchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<CustomerPurchase>>(EMPTY_PURCHASE);
  const [editingPrevious, setEditingPrevious] = useState<CustomerPurchase | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomerPurchase | null>(null);

  async function load() {
    if (!customer.id) return;
    setIsLoading(true);
    const [purchaseData, productData] = await Promise.all([
      getPurchasesByCustomer(customer.id),
      getProducts(undefined, undefined, "Active"),
    ]);
    setPurchases(purchaseData);
    setProducts(productData);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, [customer.id]);

  function handleAdd() {
    setCurrent({ ...EMPTY_PURCHASE, customer_id: customer.id });
    setEditingPrevious(null);
    setIsEditing(false);
    setModalOpen(true);
  }

  function handleEdit(purchase: CustomerPurchase) {
    setCurrent(purchase);
    setEditingPrevious(purchase);
    setIsEditing(true);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setCurrent(EMPTY_PURCHASE);
    setEditingPrevious(null);
    setIsEditing(false);
  }

  async function handleSave() {
    if (!customer.id || !current.product_id || !current.sale_price || !current.sale_date) {
      alert("Vui lòng chọn sản phẩm, nhập giá bán và ngày bán");
      return;
    }
    setIsSaving(true);
    try {
      if (isEditing && current.id && editingPrevious) {
        const { error } = await updatePurchase(current.id, { ...current, customer_id: customer.id }, editingPrevious);
        if (error) throw error;
      } else {
        const { error } = await addPurchase({ ...current, customer_id: customer.id });
        if (error) throw error;
      }
      closeModal();
      await load();
    } catch (error) {
      alert("Lỗi khi lưu giao dịch mua hàng");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(purchase: CustomerPurchase) {
    setIsSaving(true);
    try {
      const error = await deletePurchase(purchase.id!, purchase.product_id);
      if (error) throw error;
      await load();
    } catch (error) {
      alert("Lỗi khi xóa giao dịch mua hàng");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  // The Active-products dropdown won't include a product that this purchase
  // itself already sold, so splice it back in when editing.
  const modalProducts =
    isEditing && editingPrevious?.product && !products.some((p) => p.id === editingPrevious.product_id)
      ? [
          {
            id: editingPrevious.product_id!,
            product_code: editingPrevious.product.product_code,
            product_name: editingPrevious.product.product_name,
          } as Product,
          ...products,
        ]
      : products;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-primary" />
          Lịch sử mua hàng
        </h2>
        <Button variant="primary" size="sm" onClick={handleAdd}>
          <Plus className="w-4 h-4" />
          Thêm giao dịch
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin text-xl">⟳</div>
        </div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
            <PackageOpen className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Chưa có giao dịch mua hàng nào.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left font-semibold px-1 py-2">Sản phẩm</th>
                <th className="text-left font-semibold px-1 py-2">Giá bán</th>
                <th className="text-left font-semibold px-1 py-2">Ngày bán</th>
                <th className="text-left font-semibold px-1 py-2">Ghi chú</th>
                <th className="text-right font-semibold px-1 py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="border-b border-border last:border-0 group">
                  <td className="px-1 py-2.5 font-medium text-foreground">
                    {purchase.product ? (
                      <Link
                        href={`/products/${purchase.product.id}`}
                        className="text-primary hover:underline"
                      >
                        {purchase.product.product_name} ({purchase.product.product_code})
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-1 py-2.5 whitespace-nowrap">{currency.format(purchase.sale_price)}</td>
                  <td className="px-1 py-2.5 text-muted-foreground whitespace-nowrap">
                    {formatDate(purchase.sale_date)}
                  </td>
                  <td className="px-1 py-2.5 text-muted-foreground max-w-[160px] truncate">
                    {purchase.note || "—"}
                  </td>
                  <td className="px-1 py-2.5">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(purchase)}
                        className="p-1.5 hover:bg-primary/10 rounded-lg transition-colors"
                        title="Sửa"
                      >
                        <Pencil className="w-3.5 h-3.5 text-primary" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(purchase)}
                        className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PurchaseModal
        open={modalOpen}
        title={isEditing ? "Chỉnh sửa giao dịch" : "Thêm giao dịch mua hàng"}
        purchase={current}
        setPurchase={setCurrent}
        products={modalProducts}
        onSave={handleSave}
        onClose={closeModal}
        isLoading={isSaving}
      />

      <AlertDialog
        open={!!pendingDelete}
        title="Xóa giao dịch này?"
        description="Sản phẩm liên quan sẽ được chuyển lại về trạng thái Đang bán."
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </Card>
  );
}
