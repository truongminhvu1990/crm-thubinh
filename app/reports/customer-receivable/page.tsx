"use client";

import { useEffect, useState } from "react";
import { X, Wallet, AlertCircle, TrendingUp } from "lucide-react";
import { CustomerReceivableFilters, CustomerReceivableRow, CustomerReceivableSummary } from "@/types/customerReceivable";
import { FinancialSettlementState } from "@/lib/orders/order.rules";
import { CustomerReceivableColumnKey, CUSTOMER_RECEIVABLE_COLUMNS } from "@/lib/customerReceivable/customerReceivableColumns";
import { useReportColumnPreference } from "@/lib/hooks/useReportColumnPreference";
import { addDaysToDateStr } from "@/lib/dateFilter";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import ScopeIndicator from "@/components/shared/ScopeIndicator";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import ColumnPicker from "@/components/reports/ColumnPicker";
import CustomerReceivableTable from "@/components/customerReceivable/CustomerReceivableTable";
import CustomerReceivablePagination from "@/components/customerReceivable/CustomerReceivablePagination";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const inputClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const DEFAULT_FILTERS: CustomerReceivableFilters = { page: 1 };
const EMPTY_SUMMARY: CustomerReceivableSummary = { totalOutstanding: 0, totalOverpaid: 0, orderCount: 0 };

const STATUS_OPTIONS: { value: FinancialSettlementState; label: string }[] = [
  { value: "Outstanding", label: "Còn nợ" },
  { value: "Settled", label: "Đã thanh toán đủ" },
  { value: "Overpaid", label: "Dư" },
];

function buildQuery(filters: CustomerReceivableFilters): string {
  const params = new URLSearchParams();
  if (filters.searchTerm) params.set("searchTerm", filters.searchTerm);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("page", String(filters.page ?? 1));
  return params.toString();
}

/** Customer Receivable (Finance Project #1, Phase E, Product Owner Approval
 * 2026-08-21) — a read-only report over the existing Order/Payment source
 * of truth, no new ledger. Customer -> Order -> Total -> Paid ->
 * Outstanding/Overpaid, one row per Order. Order Number links to the
 * existing Order Detail page for full payment history/reference, rather
 * than duplicating that UI here (see types/customerReceivable.ts).
 *
 * Column Management (Product Owner Decision, Finance Project #1 clean
 * integration, 2026-08-22): uses the same basic visibleColumns/
 * setVisibleColumns pattern every other shipped report already uses
 * (e.g. app/reports/sales-ledger/page.tsx) — no reorder, no reset-to-
 * default. Those two capabilities aren't part of the established
 * production report pattern anywhere yet; deliberately deferred rather
 * than invented here. */
export default function CustomerReceivablePage() {
  const [filters, setFilters] = useState<CustomerReceivableFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<CustomerReceivableRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<CustomerReceivableSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");

  const availableColumnKeys = CUSTOMER_RECEIVABLE_COLUMNS.map((c) => c.key);
  const { visibleColumns, setVisibleColumns } = useReportColumnPreference<CustomerReceivableColumnKey>(
    "customer_receivable",
    availableColumnKeys
  );

  async function load() {
    setIsLoading(true);
    const res = await fetch(`/api/reports/customer-receivable?${buildQuery(filters)}`);
    const data: { rows: CustomerReceivableRow[]; totalCount: number; summary: CustomerReceivableSummary } = res.ok
      ? await res.json()
      : { rows: [], totalCount: 0, summary: EMPTY_SUMMARY };
    setRows(data.rows);
    setTotalCount(data.totalCount);
    setSummary(data.summary);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    const handle = setTimeout(() => {
      update({ searchTerm: searchInput || undefined, page: 1 });
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  function update(patch: Partial<CustomerReceivableFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function clearFilters() {
    setSearchInput("");
    setFilters(DEFAULT_FILTERS);
  }

  const hasActiveFilters = !!(filters.searchTerm || filters.status || filters.dateFrom || filters.dateTo);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Công nợ khách hàng</h1>
          <p className="text-muted-foreground mt-1.5 text-sm flex items-center gap-2 flex-wrap">
            Tổng tiền, đã thanh toán, còn lại/dư theo từng đơn hàng
            <ScopeIndicator resource="revenue" />
          </p>
          <div className="mt-1">
            <PageViewingLabel />
          </div>
        </div>
        <ColumnPicker
          testId="customer-receivable-columns-button"
          columns={CUSTOMER_RECEIVABLE_COLUMNS}
          visibleKeys={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          testId="customer-receivable-total-outstanding-card"
          title="Tổng còn nợ"
          value={currency.format(summary.totalOutstanding)}
          icon={<AlertCircle className="w-5 h-5" />}
          color="bg-amber-100 text-amber-700"
        />
        <StatCard
          testId="customer-receivable-total-overpaid-card"
          title="Tổng dư (Overpaid)"
          value={currency.format(summary.totalOverpaid)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="bg-amber-100 text-amber-700"
          hint="Không tự động hoàn tiền — chỉ hiển thị để theo dõi"
        />
        <StatCard
          testId="customer-receivable-order-count-card"
          title="Số đơn hàng"
          value={summary.orderCount}
          icon={<Wallet className="w-5 h-5" />}
        />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            data-testid="customer-receivable-search-input"
            type="text"
            placeholder="Tìm theo khách hàng, mã KH hoặc số đơn..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`${inputClass} w-72`}
          />

          <select
            data-testid="customer-receivable-status-filter"
            value={filters.status || ""}
            onChange={(e) => update({ status: (e.target.value || undefined) as FinancialSettlementState | undefined, page: 1 })}
            className={`${inputClass} w-48`}
          >
            <option value="">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Từ</span>
            <input
              data-testid="customer-receivable-date-from-input"
              type="date"
              value={filters.dateFrom || ""}
              onChange={(e) => update({ dateFrom: e.target.value || undefined, page: 1 })}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">đến</span>
            <input
              data-testid="customer-receivable-date-to-input"
              type="date"
              value={filters.dateTo ? addDaysToDateStr(filters.dateTo, -1) : ""}
              onChange={(e) => update({ dateTo: e.target.value ? addDaysToDateStr(e.target.value, 1) : undefined, page: 1 })}
              className={inputClass}
            />
          </div>

          {hasActiveFilters && (
            <Button variant="secondary" size="md" onClick={clearFilters}>
              <X className="w-4 h-4" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      <CustomerReceivableTable rows={rows} isLoading={isLoading} visibleColumns={visibleColumns} />

      <div className="print:hidden">
        <CustomerReceivablePagination page={filters.page ?? 1} totalCount={totalCount} onPageChange={(page) => update({ page })} />
      </div>
    </div>
  );
}
