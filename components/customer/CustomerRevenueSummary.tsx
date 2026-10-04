"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Customer } from "@/types/customer";
import { CustomerPurchaseSummary } from "@/types/purchase";
import { getCustomerRevenue } from "@/lib/purchase.service";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import Card from "@/components/ui/Card";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  customer: Customer;
}

/** Phase 1.6B: the revenue period is the app's Global Date Filter (same presets, same Vietnam-time semantics, same
 * [start, end) range handed to getCustomerRevenue as before). "Toàn thời gian" = no bound. The card used to keep its own
 * select with a 6-option subset and default to all time; it now follows the global period. */
export default function CustomerRevenueSummary({ customer }: Props) {
  const { range, ready, periodKey, label } = useGlobalDateFilter();
  const [result, setResult] = useState<{ key: string; summary: CustomerPurchaseSummary | null } | null>(null);

  useEffect(() => {
    if (!customer.id || !ready) return; // never fetch before the stored period is known
    let cancelled = false;
    const key = `${customer.id}|${periodKey}`;
    getCustomerRevenue(customer.id, range).then((summary) => {
      if (!cancelled) setResult({ key, summary });
    });
    return () => {
      cancelled = true;
    };
    // range is fully described by periodKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, ready, periodKey]);

  // A result for another customer / period reads as "not loaded" - the previous period's number never stays on screen.
  const summary = result && result.key === `${customer.id}|${periodKey}` ? result.summary : null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Doanh thu
        </h2>
        <GlobalDateFilter />
      </div>
      <p className="mb-2 text-sm text-muted-foreground" data-testid="customer-revenue-period">
        Kỳ báo cáo: <span className="font-medium text-foreground">{label}</span>
      </p>
      <p className="text-2xl font-bold text-foreground" data-testid="customer-revenue-total">
        {summary ? currency.format(summary.totalRevenue) : "—"}
      </p>
      <p className="text-sm text-muted-foreground mt-1">{summary?.count || 0} giao dịch</p>
    </Card>
  );
}
