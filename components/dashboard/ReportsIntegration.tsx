"use client";

import Link from "next/link";
import { Wallet, Users, Gem, Package, ArrowRight } from "lucide-react";
import Card from "@/components/ui/Card";

const links = [
  { title: "Báo cáo doanh thu", icon: Wallet, color: "bg-emerald-100 text-emerald-600" },
  { title: "Báo cáo khách hàng", icon: Users, color: "bg-primary/10 text-primary" },
  { title: "Báo cáo sản phẩm", icon: Gem, color: "bg-yellow-100 text-yellow-600" },
  { title: "Báo cáo lô hàng", icon: Package, color: "bg-blue-100 text-blue-600" },
];

// Links to the single /reports page (no per-section anchors exist there
// today, and adding them would mean modifying that LOCKED file - out of
// scope for Dashboard integration).
export default function ReportsIntegration() {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4">Xem báo cáo chi tiết</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map(({ title, icon: Icon, color }) => (
          <Link
            key={title}
            href="/reports"
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition"
          >
            <span className="flex items-center gap-3">
              <span className={`p-2 rounded-lg ${color}`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-sm font-medium text-foreground">{title}</span>
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
