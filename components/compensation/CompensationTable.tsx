"use client";

import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, Coins } from "lucide-react";
import { Compensation } from "@/types/compensation";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { compensationStatusLabel, compensationTypeLabel } from "@/lib/compensation/compensation.constants";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Draft: "muted",
  Pending: "warning",
  Confirmed: "success",
  Cancelled: "destructive",
  "Handed Off": "muted",
};

export type CompensationSortKey = "created_at" | "calculated_amount";
export type SortDir = "asc" | "desc";

function SortHeader({
  label,
  sortKeyValue,
  activeSortKey,
  activeSortDir,
  onSort,
}: {
  label: string;
  sortKeyValue: CompensationSortKey;
  activeSortKey: CompensationSortKey;
  activeSortDir: SortDir;
  onSort: (key: CompensationSortKey) => void;
}) {
  const isActive = activeSortKey === sortKeyValue;
  const Icon = isActive ? (activeSortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKeyValue)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
    >
      {label}
      <Icon className={isActive ? "w-3 h-3 text-primary" : "w-3 h-3"} />
    </button>
  );
}

interface Props {
  compensations: Compensation[];
  isLoading?: boolean;
  sortKey: CompensationSortKey;
  sortDir: SortDir;
  onSort: (key: CompensationSortKey) => void;
}

export default function CompensationTable({ compensations, isLoading = false, sortKey, sortDir, onSort }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (compensations.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Coins className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có compensation nào</p>
      </div>
    );
  }

  return (
    <>
      {/* D-01: Compact Row + Detail (Product Owner Decision) - mobile gets a
       * card list instead of the dense 12-column table; every field it shows
       * already exists on Compensation and every card links to the same
       * /compensations/[id] Detail route the table's "Mã" column already
       * uses, so no new data/route was introduced for this. */}
      <div className="lg:hidden space-y-3">
        {compensations.map((c) => (
          <Link
            key={c.id}
            href={`/compensations/${c.id}`}
            data-testid="compensation-mobile-row"
            className="block bg-card rounded-xl border border-border shadow-sm p-4 active:bg-muted/30 transition-colors touch-manipulation"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-primary text-sm truncate">{c.compensation_code}</p>
                <p className="text-sm text-foreground truncate">{c.partner?.name ?? "—"}</p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[c.status] ?? "muted"}>{compensationStatusLabel(c.status)}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground truncate">{c.order ? c.order.order_number : "—"}</span>
              <span className="text-muted-foreground shrink-0">
                {c.method === "Percentage" ? `${c.value}%` : currency.format(c.value)}
              </span>
            </div>
            <div className="mt-1 font-semibold text-foreground text-sm">{currency.format(c.calculated_amount)}</div>
          </Link>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="compensation-table" className="w-full min-w-[1600px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mã</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Người nhận</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loại</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Đơn hàng</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Khách hàng</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sản phẩm</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cơ sở tính</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phương thức</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giá trị</th>
            <th className="px-5 py-3.5 text-left">
              <SortHeader label="Số tiền" sortKeyValue="calculated_amount" activeSortKey={sortKey} activeSortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
            <th className="px-5 py-3.5 text-left">
              <SortHeader label="Ngày tạo" sortKeyValue="created_at" activeSortKey={sortKey} activeSortDir={sortDir} onSort={onSort} />
            </th>
          </tr>
        </thead>
        <tbody>
          {compensations.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-5 py-3.5 text-sm font-medium">
                <Link href={`/compensations/${c.id}`} className="text-primary hover:underline" data-testid="compensation-row-link">
                  {c.compensation_code}
                </Link>
              </td>
              <td className="px-5 py-3.5 text-sm text-foreground">{c.partner?.name ?? "—"}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{compensationTypeLabel(c.compensation_type)}</td>
              <td className="px-5 py-3.5 text-sm">
                {c.order ? (
                  <Link href={`/orders/${c.order.id}`} className="text-primary hover:underline">
                    {c.order.order_number}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.customer?.full_name ?? "—"}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.product?.product_name ?? "—"}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.basis}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.method}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {c.method === "Percentage" ? `${c.value}%` : currency.format(c.value)}
              </td>
              <td className="px-5 py-3.5 text-sm font-medium">{currency.format(c.calculated_amount)}</td>
              <td className="px-5 py-3.5 text-sm">
                <Badge variant={STATUS_BADGE_VARIANT[c.status] ?? "muted"}>{compensationStatusLabel(c.status)}</Badge>
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{c.created_at ? formatDate(c.created_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
