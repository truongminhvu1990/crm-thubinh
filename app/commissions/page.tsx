"use client";

import { useEffect, useRef, useState } from "react";
import { useGlobalDateFilter } from "@/lib/hooks/useGlobalDateFilter";
import { addDaysToDateStr } from "@/lib/dateFilter";
import GlobalDateFilter from "@/components/shared/GlobalDateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import { CommissionListFilters, SalesCommission } from "@/types/commission";
import { summarizeCommissions } from "@/lib/commission/commission.service";
import CommissionSummaryCards from "@/components/commission/CommissionSummaryCards";
import CommissionFilters from "@/components/commission/CommissionFilters";
import CommissionTable from "@/components/commission/CommissionTable";

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);
  // Phase 1.6B: the period is the Global Date Filter's; this page owns only salesperson / status. The commission service
  // filters created_at with dateTo INCLUSIVE, so the exclusive range end is converted to the last day (semantics unchanged).
  const { range, ready, periodKey } = useGlobalDateFilter();
  const [localFilters, setLocalFilters] = useState<CommissionListFilters>({});
  const filters: CommissionListFilters = {
    ...localFilters,
    dateFrom: range?.start,
    dateTo: range ? addDaysToDateStr(range.end, -1) : undefined,
  };
  const loadKey = `${periodKey}|${localFilters.salesperson ?? ""}|${localFilters.status ?? ""}`;
  const [isLoading, setIsLoading] = useState(true);

  const loadSeq = useRef(0);
  async function load(activeFilters: CommissionListFilters) {
    // Phase 1.6B: a response that arrives after a newer request was issued (period switched meanwhile) is dropped, so an older
  // period's data can never overwrite the newer one.
    const seq = ++loadSeq.current;
    setIsLoading(true);
    const params = new URLSearchParams();
    if (activeFilters.dateFrom) params.set("dateFrom", activeFilters.dateFrom);
    if (activeFilters.dateTo) params.set("dateTo", activeFilters.dateTo);
    if (activeFilters.salesperson) params.set("salesperson", activeFilters.salesperson);
    if (activeFilters.status) params.set("status", activeFilters.status);
    const query = params.toString();
    const res = await fetch(`/api/commissions${query ? `?${query}` : ""}`);
    const data: SalesCommission[] = res.ok ? await res.json() : [];
    if (seq !== loadSeq.current) return;
    setCommissions(data);
    setIsLoading(false);
  }

  useEffect(() => {
    if (!ready) return; // never fetch before the stored period is known
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loadKey]);

  const summary = summarizeCommissions(commissions);

  return (
    <div className="pb-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Hoa hồng bán hàng</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {commissions.length} bản ghi hoa hồng (kỳ báo cáo lọc theo ngày tạo bản ghi)
          </p>
          <div className="mt-1">
            <PageViewingLabel />
          </div>
        </div>
        <GlobalDateFilter />
      </div>

      <div className="mb-6">
        <CommissionSummaryCards summary={summary} />
      </div>

      <CommissionFilters filters={localFilters} onChange={setLocalFilters} />

      <CommissionTable commissions={commissions} isLoading={isLoading} />
    </div>
  );
}
