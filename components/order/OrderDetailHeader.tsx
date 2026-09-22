"use client";

import Link from "next/link";
import { User, UserCog, CalendarDays, Pencil } from "lucide-react";
import { Order } from "@/types/order";
import { formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import InfoItem from "@/components/ui/InfoItem";
import OrderStatusBadge from "./OrderStatusBadge";
import PaymentStatusBadge from "./PaymentStatusBadge";

interface Props {
  order: Order;
  /** ORDERS_UI.md §6: the inline "Đổi" (Reassign) action next to Sales Owner
   * only shows while the order is open (Draft/Reserved, §5). */
  isEditable?: boolean;
  onReassignClick?: () => void;
  /** Order Customer Editable Before Completion PD (APPROVED 2026-09-22) —
   * the inline "Đổi" action next to Customer, gated separately from
   * isEditable/onReassignClick above since the two are different business
   * rules (canChangeOrderCustomer vs. canEditOrderItems). */
  isCustomerEditable?: boolean;
  onChangeCustomerClick?: () => void;
}

/** Order Detail header (ORDERS_UI §6). Created By is deliberately
 * secondary/smaller than Sales Owner (Design Principle 5, Spec §17 risk). */
export default function OrderDetailHeader({
  order,
  isEditable = false,
  onReassignClick,
  isCustomerEditable = false,
  onChangeCustomerClick,
}: Props) {
  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{order.order_number}</h1>
            <OrderStatusBadge status={order.order_status} className="text-sm px-2.5 py-0.5" />
            <PaymentStatusBadge status={order.payment_status} className="text-sm px-2.5 py-0.5" />
          </div>
          {order.customer && (
            <p className="text-muted-foreground text-sm mt-1 inline-flex items-center gap-1.5">
              Khách hàng:{" "}
              <Link href={`/customers/${order.customer.id}`} className="text-primary hover:underline">
                {order.customer.full_name}
              </Link>
              {isCustomerEditable && onChangeCustomerClick && (
                <button
                  data-testid="order-reassign-customer-button"
                  onClick={onChangeCustomerClick}
                  className="text-primary hover:underline text-xs font-normal inline-flex items-center gap-0.5"
                  aria-label="Đổi khách hàng"
                >
                  <Pencil className="w-3 h-3" />
                  Đổi
                </button>
              )}
            </p>
          )}
        </div>
      </div>

      {order.order_status === "Lost" && order.lost_reason && (
        <div className="mt-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">
          Lý do mất đơn: {order.lost_reason}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-5">
        <InfoItem icon={<User className="w-4 h-4" />} label="Người phụ trách">
          <span className="inline-flex items-center gap-1.5">
            {order.sales_owner}
            {isEditable && onReassignClick && (
              <button
                data-testid="order-reassign-owner-button"
                onClick={onReassignClick}
                className="text-primary hover:underline text-xs font-normal inline-flex items-center gap-0.5"
                aria-label="Đổi người phụ trách"
              >
                <Pencil className="w-3 h-3" />
                Đổi
              </button>
            )}
          </span>
        </InfoItem>

        <InfoItem icon={<UserCog className="w-4 h-4" />} label="Tạo bởi">
          <span className="text-muted-foreground font-normal">{order.created_by}</span>
        </InfoItem>

        <InfoItem icon={<CalendarDays className="w-4 h-4" />} label="Ngày bán">
          {formatDate(order.order_date)}
        </InfoItem>
      </div>
    </Card>
  );
}
