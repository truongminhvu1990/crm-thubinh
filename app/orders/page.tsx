"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { OrderListItem } from "@/lib/orders/order.service";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/orders/order.constants";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import OrderTable from "@/components/order/OrderTable";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderListItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("ALL");
  const [salesOwnerFilter, setSalesOwnerFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const salesOwnerOptions = useMasterDataOptions("salesperson");

  async function loadOrders() {
    setIsLoading(true);
    const res = await fetch("/api/orders");
    const data: OrderListItem[] = res.ok ? await res.json() : [];
    setOrders(data);
    filterOrders(data, searchTerm, orderStatusFilter, paymentStatusFilter, salesOwnerFilter, dateFrom, dateTo);
    setIsLoading(false);
  }

  function filterOrders(
    data: OrderListItem[],
    search: string,
    orderStatus: string,
    paymentStatus: string,
    salesOwner: string,
    from: string,
    to: string
  ) {
    let filtered = data;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.order_number.toLowerCase().includes(searchLower) ||
          (o.customer?.full_name || "").toLowerCase().includes(searchLower) ||
          (o.customer?.phone || "").includes(search)
      );
    }

    if (orderStatus !== "ALL") {
      filtered = filtered.filter((o) => o.order_status === orderStatus);
    }

    if (paymentStatus !== "ALL") {
      filtered = filtered.filter((o) => o.payment_status === paymentStatus);
    }

    if (salesOwner !== "ALL") {
      filtered = filtered.filter((o) => o.sales_owner === salesOwner);
    }

    if (from) {
      filtered = filtered.filter((o) => o.order_date >= from);
    }

    if (to) {
      filtered = filtered.filter((o) => o.order_date <= to);
    }

    setFilteredOrders(filtered);
  }

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    filterOrders(orders, value, orderStatusFilter, paymentStatusFilter, salesOwnerFilter, dateFrom, dateTo);
  }

  function handleOrderStatusChange(value: string) {
    setOrderStatusFilter(value);
    filterOrders(orders, searchTerm, value, paymentStatusFilter, salesOwnerFilter, dateFrom, dateTo);
  }

  function handlePaymentStatusChange(value: string) {
    setPaymentStatusFilter(value);
    filterOrders(orders, searchTerm, orderStatusFilter, value, salesOwnerFilter, dateFrom, dateTo);
  }

  function handleSalesOwnerChange(value: string) {
    setSalesOwnerFilter(value);
    filterOrders(orders, searchTerm, orderStatusFilter, paymentStatusFilter, value, dateFrom, dateTo);
  }

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    filterOrders(orders, searchTerm, orderStatusFilter, paymentStatusFilter, salesOwnerFilter, value, dateTo);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    filterOrders(orders, searchTerm, orderStatusFilter, paymentStatusFilter, salesOwnerFilter, dateFrom, value);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Đơn hàng</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {orders.length} đơn hàng · Hiển thị {filteredOrders.length}
          </p>
        </div>
        <Link href="/orders/new">
          <Button variant="primary">
            <Plus className="w-4 h-4" />
            Tạo đơn hàng
          </Button>
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <SearchInput
              placeholder="Tìm theo mã đơn hoặc tên/SĐT khách hàng..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onClear={() => handleSearchChange("")}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={orderStatusFilter}
              onChange={(e) => handleOrderStatusChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả trạng thái</option>
              {ORDER_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={paymentStatusFilter}
              onChange={(e) => handlePaymentStatusChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả thanh toán</option>
              {PAYMENT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={salesOwnerFilter}
              onChange={(e) => handleSalesOwnerChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả nhân viên</option>
              {salesOwnerOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <Button variant="secondary" size="md" onClick={loadOrders}>
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Làm mới</span>
            </Button>
          </div>
        </div>
      </div>

      <OrderTable orders={filteredOrders} isLoading={isLoading} />
    </div>
  );
}
