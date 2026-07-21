"use client";

import { useEffect, useState } from "react";
import { CommissionListFilters, SalesCommission } from "@/types/commission";
import { getCommissionList, summarizeCommissions } from "@/lib/commission/commission.service";
import CommissionSummaryCards from "@/components/commission/CommissionSummaryCards";
import CommissionFilters from "@/components/commission/CommissionFilters";
import CommissionTable from "@/components/commission/CommissionTable";

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);
  const [filters, setFilters] = useState<CommissionListFilters>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load(activeFilters: CommissionListFilters) {
    setIsLoading(true);
    const data = await getCommissionList(activeFilters);
    setCommissions(data);
    setIsLoading(false);
  }

  useEffect(() => {
    load(filters);
  }, [filters]);

  const summary = summarizeCommissions(commissions);

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Hoa hồng bán hàng</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {commissions.length} bản ghi hoa hồng
        </p>
      </div>

      <div className="mb-6">
        <CommissionSummaryCards summary={summary} />
      </div>

      <CommissionFilters filters={filters} onChange={setFilters} />

      <CommissionTable commissions={commissions} isLoading={isLoading} />
    </div>
  );
}
