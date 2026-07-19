"use client";

import Link from "next/link";
import { User, UserCog, CalendarDays, Package, Wallet } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import InfoItem from "@/components/ui/InfoItem";
import { formatDate } from "@/lib/utils";
import { OrderListItem } from "@/lib/orders/order.service";
import OrderStatusBadge from "./OrderStatusBadge";
import PaymentStatusBadge from "./PaymentStatusBadge";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  order: OrderListItem;
  open: boolean;
  onClose: () => void;
}

/** ORDERS_UI.md §3 Quick View — read-only summary popup, no editing of any
 * kind. Built entirely from the row's own already-fetched OrderListItem, no
 * extra request needed. */
export default function OrderQuickViewModal({ order, open, onClose }: Props) {
  if (!open) return null;

  return (
    <Modal open={open} title={order.order_number} onClose={onClose}>
      <div className="flex items-center gap-2 mb-5">
        <OrderStatusBadge status={order.order_status} />
        <PaymentStatusBadge status={order.payment_status} />
      </div>

      {order.order_status === "Lost" && order.lost_reason && (
        <div className="mb-5 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">
          Lý do mất đơn: {order.lost_reason}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <InfoItem icon={<UserCog className="w-4 h-4" />} label="Khách hàng">
          {order.customer ? (
            <Link href={`/customers/${order.customer.id}`} className="text-primary hover:underline">
              {order.customer.full_name}
            </Link>
          ) : (
            "—"
          )}
        </InfoItem>
        <InfoItem icon={<User className="w-4 h-4" />} label="Người phụ trách">
          {order.sales_owner}
        </InfoItem>
        <InfoItem icon={<CalendarDays className="w-4 h-4" />} label="Ngày tạo">
          {formatDate(order.order_date)}
        </InfoItem>
        <InfoItem icon={<Package className="w-4 h-4" />} label="Số sản phẩm">
          {order.item_count} sản phẩm
        </InfoItem>
        <InfoItem icon={<Wallet className="w-4 h-4" />} label="Tổng tiền">
          {currency.format(order.total_amount)}
        </InfoItem>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
        <Link href={`/orders/${order.id}`}>
          <Button variant="primary">Xem chi tiết đầy đủ</Button>
        </Link>
      </div>
    </Modal>
  );
}
