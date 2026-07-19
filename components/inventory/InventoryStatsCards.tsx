"use client";

import { Boxes } from "lucide-react";
import { CountBreakdown, InventoryStats } from "@/lib/inventory.service";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";

interface Props {
  stats: InventoryStats;
}

function BreakdownCard({ title, breakdown }: { title: string; breakdown: CountBreakdown[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-muted-foreground text-sm mb-2.5">{title}</p>
      {breakdown.length === 0 ? (
        <p className="text-sm text-muted-foreground/50">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {breakdown.map((row) => (
            <span
              key={row.label}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-foreground"
            >
              {row.label}
              <span className="font-semibold">{row.count}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Counts only - Status Distribution is COUNT(*) GROUP BY products.status,
 * never products.available/reserved/sold (Spec §1/§8, UI §1.4). */
export default function InventoryStatsCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      <StatCard
        title="Tổng sản phẩm"
        value={stats.total}
        icon={<Boxes className="w-6 h-6 text-primary" />}
      />
      <BreakdownCard title="Theo trạng thái" breakdown={stats.byStatus} />
      <BreakdownCard title="Theo nguồn gốc" breakdown={stats.byOrigin} />
      <BreakdownCard title="Theo danh mục" breakdown={stats.byCategory} />
      <BreakdownCard title="Theo lô hàng" breakdown={stats.byBatch} />
      <BreakdownCard title="Theo nhân viên" breakdown={stats.bySalesOwner} />
    </div>
  );
}
