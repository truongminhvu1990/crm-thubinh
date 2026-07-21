"use client";

import Link from "next/link";
import { Trophy, ArrowRight } from "lucide-react";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import { TopSalesStaffEntry } from "@/lib/staff.service";

interface Props {
  entries: TopSalesStaffEntry[];
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/** Feature 9 - Dashboard "Top Sales Staff" widget. Ranked by revenue
 * (customer_purchases), shows commission (sales_commissions) alongside -
 * see getTopSalesStaff()'s salesperson_id-first, salesperson-text-fallback
 * matching (Feature 6). */
export default function TopSalesStaffCard({ entries }: Props) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Trophy className="w-4.5 h-4.5 text-amber-600" />
          Nhân viên bán hàng xuất sắc
        </h2>
        <Link href="/settings/staff" className="text-muted-foreground hover:text-primary transition-colors">
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">Chưa có dữ liệu doanh thu</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, index) => (
            <li key={entry.staff.id}>
              <Link
                href={`/settings/staff/${entry.staff.id}`}
                className="flex items-center gap-3 hover:bg-muted/30 -mx-1 px-1 py-1 rounded-lg transition-colors"
              >
                <span className="w-5 text-center text-xs font-semibold text-muted-foreground shrink-0">
                  {index + 1}
                </span>
                <Avatar name={entry.staff.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{entry.staff.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Hoa hồng: {currency.format(entry.commission)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground shrink-0">{currency.format(entry.revenue)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
