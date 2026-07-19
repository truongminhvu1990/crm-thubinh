"use client";

import { useState } from "react";
import { Customer } from "@/types/customer";
import { CustomerPurchaseSummary } from "@/types/purchase";
import { Edit2, Trash2, MapPin, Phone, Gem, Users } from "lucide-react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";
import Avatar from "@/components/ui/Avatar";
import { getCustomerTier, TIER_BADGE_VARIANT } from "@/lib/purchase.constants";
import { formatDate } from "@/lib/utils";

interface Props {
  customers: Customer[];
  purchaseSummaries: Map<string, CustomerPurchaseSummary>;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  isLoading?: boolean;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function CustomerTable({
  customers,
  purchaseSummaries,
  onEdit,
  onDelete,
  isLoading = false,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Users className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có khách hàng nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[1160px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Khách hàng
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Liên hệ
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Loại
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Nguồn
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Doanh thu
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Mua gần nhất
            </th>
            <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Thao tác
            </th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => {
            const summary = (customer.id && purchaseSummaries.get(customer.id)) || null;
            const tier = getCustomerTier(summary?.totalRevenue || 0);

            return (
              <tr
                key={customer.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
              >
                <td className="px-5 py-3.5">
                  <Link href={`/customers/${customer.id}`} className="flex items-center gap-3">
                    <Avatar name={customer.full_name} vip={customer.vip_level === "VIP"} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {customer.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground">{customer.customer_code}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <div className="text-sm space-y-1">
                    {customer.phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        {customer.phone}
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[220px]">{customer.address}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm">
                  {customer.vip_level === "VIP" ? (
                    <Badge variant="vip">
                      <Gem className="w-3.5 h-3.5" />
                      VIP
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Normal</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground">
                  {customer.source || "—"}
                </td>
                <td className="px-5 py-3.5 text-sm">
                  <div className="font-medium text-foreground">
                    {summary ? currency.format(summary.totalRevenue) : "—"}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {summary?.count || 0} đơn
                    </span>
                    {tier && (
                      <Badge variant={TIER_BADGE_VARIANT[tier]} className="text-[10px] px-1.5 py-0">
                        {tier}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground">
                  {summary?.lastPurchaseDate ? formatDate(summary.lastPurchaseDate) : "—"}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1 justify-end opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(customer)}
                      className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Edit2 className="w-4 h-4 text-primary" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(customer)}
                      className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <AlertDialog
        open={!!pendingDelete}
        title="Xóa khách hàng?"
        description={
          pendingDelete
            ? `Bạn có chắc muốn xóa "${pendingDelete.full_name}"? Hành động này không thể hoàn tác.`
            : undefined
        }
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
