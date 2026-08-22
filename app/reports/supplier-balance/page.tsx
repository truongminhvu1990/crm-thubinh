"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Users, Landmark, ExternalLink } from "lucide-react";
import { SupplierBalanceFilters, SupplierBalanceRow, SupplierBalanceSummary } from "@/types/supplierBalance";
import { MoneyDebtLedgerCurrency } from "@/types/moneyDebtLedger";
import PageViewingLabel from "@/components/shared/PageViewingLabel";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import SupplierBalanceTable from "@/components/supplierBalance/SupplierBalanceTable";

const inputClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const DEFAULT_FILTERS: SupplierBalanceFilters = {};
const EMPTY_SUMMARY: SupplierBalanceSummary = { supplierCount: 0, rowCount: 0 };

function buildQuery(filters: SupplierBalanceFilters): string {
  const params = new URLSearchParams();
  if (filters.searchTerm) params.set("searchTerm", filters.searchTerm);
  if (filters.currency) params.set("currency", filters.currency);
  return params.toString();
}

/** Supplier Balance (Finance Project #1, Phase F re-scope, Product Owner
 * Approval 2026-08-21). Read-only report over money_debt_ledger_entries —
 * NOT a Payable/Receivable report (PO-D4, docs/19_MONEY_DEBT_LEDGER_SPEC.md,
 * remains an unresolved, deferred decision — this page must never label
 * the balance as owed/due in either direction). No Purchase entity exists
 * in this codebase, so no purchase total/reference/date is shown — only
 * what the Money Debt Ledger itself actually records: Σ IN, Σ OUT,
 * Balance, and the most recent transaction date, per (Supplier,
 * currency). */
export default function SupplierBalancePage() {
  const [filters, setFilters] = useState<SupplierBalanceFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<SupplierBalanceRow[]>([]);
  const [summary, setSummary] = useState<SupplierBalanceSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");

  async function load() {
    setIsLoading(true);
    const res = await fetch(`/api/reports/supplier-balance?${buildQuery(filters)}`);
    const data: { rows: SupplierBalanceRow[]; summary: SupplierBalanceSummary } = res.ok
      ? await res.json()
      : { rows: [], summary: EMPTY_SUMMARY };
    setRows(data.rows);
    setSummary(data.summary);
    setIsLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((f) => ({ ...f, searchTerm: searchInput || undefined }));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  function clearFilters() {
    setSearchInput("");
    setFilters(DEFAULT_FILTERS);
  }

  const hasActiveFilters = !!(filters.searchTerm || filters.currency);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Số dư Supplier</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Tổng IN, tổng OUT và số dư theo từng Supplier — đọc trực tiếp từ Money Debt Ledger, không phải công nợ phải trả
          </p>
          <div className="mt-1">
            <PageViewingLabel />
          </div>
        </div>
        <Link
          href="/money-debt-ledger"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          data-testid="supplier-balance-view-ledger-link"
        >
          Xem giao dịch chi tiết trên Money Debt Ledger
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard
          testId="supplier-balance-supplier-count-card"
          title="Số Supplier có giao dịch"
          value={summary.supplierCount}
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          testId="supplier-balance-row-count-card"
          title="Số dòng (Supplier × đơn vị tiền tệ)"
          value={summary.rowCount}
          icon={<Landmark className="w-5 h-5" />}
        />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            data-testid="supplier-balance-search-input"
            type="text"
            placeholder="Tìm theo tên hoặc mã Supplier..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`${inputClass} w-72`}
          />

          <select
            data-testid="supplier-balance-currency-filter"
            value={filters.currency || ""}
            onChange={(e) => setFilters((f) => ({ ...f, currency: (e.target.value || undefined) as MoneyDebtLedgerCurrency | undefined }))}
            className={`${inputClass} w-40`}
          >
            <option value="">Tất cả đơn vị tiền tệ</option>
            <option value="VND">VND</option>
            <option value="CNY">CNY</option>
          </select>

          {hasActiveFilters && (
            <Button variant="secondary" size="md" onClick={clearFilters}>
              <X className="w-4 h-4" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>

      <SupplierBalanceTable rows={rows} isLoading={isLoading} />
    </div>
  );
}
