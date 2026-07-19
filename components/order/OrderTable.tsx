"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, ReceiptText } from "lucide-react";
import { OrderListItem } from "@/lib/orders/order.service";
import { formatDate } from "@/lib/utils";
import OrderStatusBadge from "./OrderStatusBadge";
import PaymentStatusBadge from "./PaymentStatusBadge";
import OrderQuickViewModal from "./OrderQuickViewModal";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  orders: OrderListItem[];
  isLoading?: boolean;
}

export default function OrderTable({ orders, isLoading = false }: Props) {
  const [quickViewOrder, setQuickViewOrder] = useState<OrderListItem | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <ReceiptText className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có đơn hàng nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[1160px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Mã đơn
            </th>
            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Khách hàng
            </th>
            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Ngày
            </th>
            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Số SP
            </th>
            <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Tổng tiền
            </th>
            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Thanh toán
            </th>
            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Trạng thái
            </th>
            <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3">
              Người phụ trách
            </th>
            <th className="px-4 py-3" aria-label="Xem nhanh" />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors group">
              <td className="px-4 py-3">
                <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                  {order.order_number}
                </Link>
              </td>
              <td className="px-4 py-3">
                {order.customer ? (
                  <Link href={`/customers/${order.customer.id}`} className="text-foreground hover:text-primary hover:underline">
                    {order.customer.full_name}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(order.order_date)}</td>
              <td className="px-4 py-3 text-muted-foreground">{order.item_count} sản phẩm</td>
              <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                {currency.format(order.total_amount)}
              </td>
              <td className="px-4 py-3">
                <PaymentStatusBadge status={order.payment_status} />
              </td>
              <td className="px-4 py-3">
                <OrderStatusBadge status={order.order_status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">{order.sales_owner}</td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => setQuickViewOrder(order)}
                  className="text-muted-foreground hover:text-primary transition-colors rounded-md p-1"
                  aria-label="Xem nhanh"
                  title="Xem nhanh"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {quickViewOrder && (
        <OrderQuickViewModal order={quickViewOrder} open={!!quickViewOrder} onClose={() => setQuickViewOrder(null)} />
      )}
    </div>
  );
}
