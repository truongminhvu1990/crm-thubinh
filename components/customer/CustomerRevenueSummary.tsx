"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Customer } from "@/types/customer";
import { CustomerPurchaseSummary } from "@/types/purchase";
import { getCustomerRevenue } from "@/lib/purchase.service";
import { getDateRange } from "@/lib/reports/reports.service";
import Card from "@/components/ui/Card";
import CustomerRevenueDateFilter, { CustomerDateFilterOption } from "./CustomerRevenueDateFilter";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  customer: Customer;
}

export default function CustomerRevenueSummary({ customer }: Props) {
  const [filter, setFilter] = useState<CustomerDateFilterOption>("all_time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [summary, setSummary] = useState<CustomerPurchaseSummary | null>(null);

  useEffect(() => {
    if (!customer.id) return;
    // "all_time" -> no range at all (getCustomerRevenue treats null as no
    // date filter). Every other value goes through reports.service.ts's own
    // getDateRange() unchanged - same range Reports would compute for it.
    const range = filter === "all_time" ? null : getDateRange(filter, customFrom, customTo);
    getCustomerRevenue(customer.id, range).then(setSummary);
  }, [customer.id, filter, customFrom, customTo]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Doanh thu
        </h2>
        <CustomerRevenueDateFilter
          value={filter}
          customFrom={customFrom}
          customTo={customTo}
          onChange={setFilter}
          onCustomChange={(from, to) => {
            setCustomFrom(from);
            setCustomTo(to);
          }}
        />
      </div>
      <p className="text-2xl font-bold text-foreground">
        {summary ? currency.format(summary.totalRevenue) : "—"}
      </p>
      <p className="text-sm text-muted-foreground mt-1">{summary?.count || 0} giao dịch</p>
    </Card>
  );
}
