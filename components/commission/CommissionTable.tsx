"use client";

import Link from "next/link";
import { Users, User } from "lucide-react";
import { SalesCommission } from "@/types/commission";
import { COMMISSION_STATUS_LABEL, COMMISSION_STATUS_BADGE_VARIANT } from "@/lib/commission/commission.constants";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";

interface Props {
  commissions: SalesCommission[];
  isLoading?: boolean;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export default function CommissionTable({ commissions, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (commissions.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Users className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có hoa hồng nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[1000px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ngày
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Khách hàng
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Nhân viên
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Giá trị bán
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tỷ lệ
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Hoa hồng
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trạng thái
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ngày thanh toán
            </th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(c.created_at)}
              </td>
              <td className="px-5 py-3.5">
                <Link href={`/commissions/${c.id}`} className="text-sm font-medium text-primary hover:underline">
                  {c.customer?.full_name || "—"}
                </Link>
                {c.customer?.customer_code && (
                  <div className="text-xs text-muted-foreground">{c.customer.customer_code}</div>
                )}
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  {c.salesperson || "—"}
                </div>
              </td>
              <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">
                {currency.format(c.sale_amount)}
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.commission_percent}%</td>
              <td className="px-5 py-3.5 text-sm font-medium text-foreground whitespace-nowrap">
                {currency.format(c.commission_amount)}
              </td>
              <td className="px-5 py-3.5">
                <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[c.status]}>
                  {COMMISSION_STATUS_LABEL[c.status]}
                </Badge>
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                {c.paid_at ? formatDate(c.paid_at) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
