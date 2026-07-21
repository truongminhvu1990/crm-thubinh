"use client";

import Link from "next/link";
import { Wallet, TrendingUp, ArrowRight } from "lucide-react";
import Card from "@/components/ui/Card";

interface Props {
  thisMonth: number;
  outstanding: number;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/** Feature 6. Reads sales_commissions only (via
 * commission.service.getDashboardCommissionStats()) - never
 * customer_purchases, per the spec's explicit Dashboard instruction. */
export default function CommissionSummaryCard({ thisMonth, outstanding }: Props) {
  return (
    <Link href="/commissions" className="block">
      <Card className="hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Hoa hồng bán hàng</h2>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-1.5">
              <Wallet className="w-4.5 h-4.5 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground">{currency.format(thisMonth)}</p>
            <p className="text-xs text-muted-foreground">Hoa hồng tháng này</p>
          </div>
          <div>
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center mb-1.5">
              <TrendingUp className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <p className="text-lg font-bold text-foreground">{currency.format(outstanding)}</p>
            <p className="text-xs text-muted-foreground">Hoa hồng chưa thanh toán</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
