"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { OrderDetail } from "@/lib/orders/order.service";
import {
  canDeleteOrder,
  canAdminDeleteOrder,
  canEditOrderItems,
  canCompleteOrder,
  canMarkOrderLost,
  canCancelOrder,
  canAddPayment,
  validateOrderHasItems,
} from "@/lib/orders/order.rules";
import { getProducts, getProductById } from "@/lib/product.service";
import { Product } from "@/types/product";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/orders/order.constants";
import { BusinessTime } from "@/lib/businessTime";
import { useIsOwnerOrManager } from "@/lib/hooks/useIsOwnerOrManager";
import { useIsOwner } from "@/lib/hooks/useIsOwner";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import SearchInput from "@/components/ui/SearchInput";
import AlertDialog from "@/components/ui/AlertDialog";
import OrderDetailHeader from "@/components/order/OrderDetailHeader";
import OrderLineItemsTable from "@/components/order/OrderLineItemsTable";
import OrderTimeline from "@/components/order/OrderTimeline";
import OrderPaymentsList from "@/components/order/OrderPaymentsList";
import AddPaymentModal from "@/components/order/AddPaymentModal";
import OrderEventTimeline from "@/components/order/OrderEventTimeline";
import MarkOrderLostModal from "@/components/order/MarkOrderLostModal";
import ReassignSalesOwnerModal from "@/components/order/ReassignSalesOwnerModal";
import CancelOrderModal from "@/components/order/CancelOrderModal";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [noteDraft, setNoteDraft] = useState("");
  const [orderDateDraft, setOrderDateDraft] = useState("");
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Simple Profit Calculation Package, Part 2: Profit = Selling Price - Cost
  // Price, computed in memory only (never stored, no new column). "Selling
  // Price" here is each line's already-computed line_total (existing value,
  // reflects quantity + discount as already applied elsewhere in this
  // page); "Cost Price" is looked up from the product's current cost_price
  // via the existing getProductById() - the order item itself never
  // snapshots cost. Owner/Manager only (Part 6/4's same rule, reused here).
  const [orderProfit, setOrderProfit] = useState<number | null>(null);
  const canViewProfit = useIsOwnerOrManager();

  // D12 Order Cancellation (Product Owner Authorization, 2026-08-19,
  // Decision B, LOCKED) — Owner/Manager only, Sales cannot cancel. Client-
  // side visibility only, same "server re-checks regardless" convention as
  // isOwner/isDeletable below (authorizeOrderCancellation is the real
  // boundary, app/api/orders/[id]/cancel/route.ts).
  const canCancel = useIsOwnerOrManager();

  // Admin/Owner Full Order Control (Product Owner Decision, 2026-08-14) —
  // Owner bypasses the Draft/Unpaid-only Delete gate entirely (see
  // isDeletable below). Client-side visibility only, matching this
  // codebase's existing "server re-checks regardless" convention
  // (authorizeOrderWrite + the role check inside
  // delete_order_with_reconciliation itself, 2026081717 migration) — this
  // hook never being the real authorization boundary.
  const isOwner = useIsOwner();

  async function loadOrder() {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/orders/${id}`);
      const data: OrderDetail | null = res.ok ? await res.json() : null;
      setDetail(data);
      if (data) {
        setNoteDraft(data.order.note || "");
        setOrderDateDraft(data.order.order_date);
      }
    } catch (error) {
      console.error("Failed to load order:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadOrder();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!canViewProfit || !detail || detail.items.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) setOrderProfit(null);
      });
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const uniqueProductIds = Array.from(new Set(detail.items.map((item) => item.product_id)));
      const products = await Promise.all(uniqueProductIds.map((productId) => getProductById(productId)));
      const costByProductId = new Map(products.filter((p): p is Product => !!p).map((p) => [p.id!, p.cost_price]));

      const totalSellingPrice = detail.items.reduce((sum, item) => sum + item.line_total, 0);
      const totalCost = detail.items.reduce((sum, item) => {
        const costPrice = costByProductId.get(item.product_id);
        return sum + (typeof costPrice === "number" ? costPrice * item.quantity : 0);
      }, 0);

      if (!cancelled) setOrderProfit(totalSellingPrice - totalCost);
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewProfit, detail]);

  async function handleSaveDetails() {
    setActionError(null);
    setIsSavingDetails(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_date: orderDateDraft, note: noteDraft || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể lưu thay đổi");
      }
      await loadOrder();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleProductSearch(value: string) {
    setProductSearch(value);
    if (!value) {
      setProductResults([]);
      return;
    }
    // BR-003 (LOCKED, 2026-08-21) - was "Active".
    setProductResults(await getProducts(value, undefined, "Available"));
  }

  async function handleAddItem(product: Product) {
    setActionError(null);
    setIsAddingItem(true);
    try {
      const res = await fetch(`/api/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          snapshot_sale_price: product.sale_price ?? 0,
          discount: product.discount ?? 0,
          quantity: 1,
          is_gift: false,
          gift_recipient_name: null,
          gift_note: null,
          packaging_option: null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể thêm sản phẩm");
      }
      setProductSearch("");
      setProductResults([]);
      await loadOrder();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsAddingItem(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/items/${itemId}?order_id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể xóa sản phẩm");
      }
      await loadOrder();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    }
  }

  async function handleDeleteOrder() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể xóa đơn hàng");
      }
      router.push("/orders");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
    }
  }

  async function handleComplete() {
    setActionError(null);
    setIsCompleting(true);
    try {
      const res = await fetch(`/api/orders/${id}/complete`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể hoàn thành đơn hàng");
      }
      await loadOrder();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsCompleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy đơn hàng</p>
        <Button onClick={() => router.back()} className="mt-4">
          Quay lại
        </Button>
      </div>
    );
  }

  const { order, items, payments, events } = detail;
  const isEditable = canEditOrderItems(order.order_status);
  const isDeletable = isOwner ? canAdminDeleteOrder() : canDeleteOrder(order.order_status, order.payment_status);

  // Delete confirmation must identify the order (Product Owner requirement,
  // 2026-08-13) — the old fixed "Đơn hàng ở trạng thái Nháp..." copy was
  // only ever true for the Draft-only Delete rule; now that Owner can also
  // delete an order in any status, the dialog has to say which one.
  const orderStatusLabel = ORDER_STATUS.find((s) => s.value === order.order_status)?.label ?? order.order_status;
  const paymentStatusLabel =
    PAYMENT_STATUS.find((s) => s.value === order.payment_status)?.label ?? order.payment_status;
  const deleteConfirmDescription = `Đơn hàng ${order.order_number}${
    order.customer ? ` — ${order.customer.full_name}` : ""
  } · ${currency.format(order.total_amount)} · ${orderStatusLabel} / ${paymentStatusLabel} sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.`;
  const isCompletable = canCompleteOrder(order.order_status);
  const isLosable = canMarkOrderLost(order.order_status);
  const completeBlockedReason = isCompletable ? validateOrderHasItems(items.length) : null;
  const isCancellable = canCancelOrder(order.order_status) && canCancel;

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-primary/5"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </button>

        <div className="flex items-center gap-2">
          {isLosable && (
            <Button data-testid="order-lost-button" variant="secondary" size="sm" onClick={() => setIsLostModalOpen(true)}>
              Đánh dấu Lost
            </Button>
          )}
          {isCompletable && (
            <div className="text-right">
              <Button
                data-testid="order-complete-button"
                variant="success"
                size="sm"
                onClick={handleComplete}
                isLoading={isCompleting}
                disabled={!!completeBlockedReason}
              >
                Hoàn thành đơn
              </Button>
              {completeBlockedReason && (
                <p className="text-xs text-destructive mt-1">{completeBlockedReason}</p>
              )}
            </div>
          )}
          {isCancellable && (
            <Button data-testid="order-cancel-trigger-button" variant="danger" size="sm" onClick={() => setIsCancelModalOpen(true)}>
              Hủy đơn
            </Button>
          )}
          {isDeletable && (
            <Button data-testid="order-delete-trigger-button" variant="danger" size="sm" onClick={() => setIsDeleteConfirmOpen(true)}>
              <Trash2 className="w-4 h-4" />
              Xóa đơn hàng
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{actionError}</div>
      )}

      <div className="space-y-6">
        <OrderDetailHeader
          order={order}
          isEditable={isEditable}
          onReassignClick={() => setIsReassignModalOpen(true)}
        />

        <OrderTimeline order={order} />

        {isEditable && (
          <Card>
            <h2 className="text-lg font-semibold text-foreground mb-4">Chỉnh sửa đơn hàng</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                data-testid="order-date-input"
                label="Ngày bán"
                type="date"
                value={orderDateDraft}
                onChange={(e) => setOrderDateDraft(e.target.value)}
              />
              <Input data-testid="order-note-input" label="Ghi chú" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
            </div>
            <div className="flex justify-end mt-4">
              <Button data-testid="order-save-details-button" variant="secondary" size="sm" onClick={handleSaveDetails} isLoading={isSavingDetails}>
                Lưu thay đổi
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Sản phẩm</h2>
            {canViewProfit && orderProfit !== null && (
              <p className="text-sm font-medium text-foreground">
                Lãi / Lỗ: <span className="text-emerald-600">{currency.format(orderProfit)}</span>
              </p>
            )}
          </div>
          <OrderLineItemsTable items={items} editable={isEditable} onRemove={handleRemoveItem} />

          {isEditable && (
            <div className="relative mt-4 pt-4 border-t border-border">
              <SearchInput
                data-testid="order-detail-product-search-input"
                placeholder="Tìm sản phẩm để thêm..."
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                onClear={() => handleProductSearch("")}
                disabled={isAddingItem}
              />
              {productResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {productResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      data-testid="order-add-item-button"
                      onClick={() => handleAddItem(product)}
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
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Thanh toán</h2>
            {canAddPayment(order.order_status, order.payment_status) && (
              <Button data-testid="order-add-payment-button" variant="secondary" size="sm" onClick={() => setIsPaymentModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Thêm thanh toán
              </Button>
            )}
          </div>
          <OrderPaymentsList payments={payments} totalAmount={order.total_amount} />
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Lịch sử hoạt động</h2>
          <OrderEventTimeline events={events} />
        </Card>

        {(order.created_at || order.updated_at) && (
          <p className="text-xs text-muted-foreground text-center">
            {order.created_at && `Tạo lúc ${BusinessTime.formatDateTime(order.created_at)}`}
            {order.created_at && order.updated_at && " · "}
            {order.updated_at && `Cập nhật lần cuối ${BusinessTime.formatDateTime(order.updated_at)}`}
          </p>
        )}
      </div>

      <AddPaymentModal
        open={isPaymentModalOpen}
        orderId={id}
        totalAmount={order.total_amount}
        payments={payments}
        onClose={() => setIsPaymentModalOpen(false)}
        onSaved={() => {
          setIsPaymentModalOpen(false);
          loadOrder();
        }}
      />

      <AlertDialog
        testId="order-delete"
        open={isDeleteConfirmOpen}
        title="Xóa đơn hàng?"
        description={deleteConfirmDescription}
        confirmLabel={isDeleting ? "Đang xóa..." : "Xóa"}
        onConfirm={handleDeleteOrder}
        onOpenChange={setIsDeleteConfirmOpen}
      />

      <MarkOrderLostModal
        open={isLostModalOpen}
        orderId={id}
        onClose={() => setIsLostModalOpen(false)}
        onSaved={() => {
          setIsLostModalOpen(false);
          loadOrder();
        }}
      />

      <ReassignSalesOwnerModal
        open={isReassignModalOpen}
        orderId={id}
        currentOwner={order.sales_owner}
        onClose={() => setIsReassignModalOpen(false)}
        onSaved={() => {
          setIsReassignModalOpen(false);
          loadOrder();
        }}
      />

      <CancelOrderModal
        open={isCancelModalOpen}
        orderId={id}
        items={items}
        onClose={() => setIsCancelModalOpen(false)}
        onSaved={() => {
          setIsCancelModalOpen(false);
          loadOrder();
        }}
      />
    </div>
  );
}
