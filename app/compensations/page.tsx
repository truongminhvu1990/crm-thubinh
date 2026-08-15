"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Download, X, Coins, ClipboardList } from "lucide-react";
import { Compensation } from "@/types/compensation";
import { COMPENSATION_TYPE_OPTIONS, COMPENSATION_STATUS_OPTIONS } from "@/lib/compensation/compensation.constants";
import { exportCompensationsToCsv } from "@/lib/compensationImportExport";
import CompensationTable, { CompensationSortKey, SortDir } from "@/components/compensation/CompensationTable";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import SearchToolbar from "@/components/ui/SearchToolbar";

const PAGE_SIZE = 20;

export default function CompensationsPage() {
  const router = useRouter();
  const [compensations, setCompensations] = useState<Compensation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<CompensationSortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const hasActiveFilters = searchTerm !== "" || typeFilter !== "ALL" || statusFilter !== "ALL";

  async function loadCompensations() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("compensationType", typeFilter);

      const res = await fetch(`/api/compensations?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      setCompensations(await res.json());
    } catch (error) {
      console.error("Failed to load compensations:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadCompensations();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, typeFilter, statusFilter]);

  useEffect(() => {
    queueMicrotask(() => {
      setPage(1);
    });
  }, [searchTerm, typeFilter, statusFilter]);

  function handleSort(key: CompensationSortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleClearFilters() {
    setSearchTerm("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
  }

  function handleExportCsv() {
    const csv = exportCompensationsToCsv(sortedCompensations);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `compensation-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const sortedCompensations = [...compensations].sort((a, b) => {
    let diff = 0;
    if (sortKey === "calculated_amount") diff = a.calculated_amount - b.calculated_amount;
    else diff = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    return sortDir === "asc" ? diff : -diff;
  });

  const totalPages = Math.max(1, Math.ceil(sortedCompensations.length / PAGE_SIZE));
  const pageCompensations = sortedCompensations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-primary" />
            Compensation
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {compensations.length} compensation · Hiển thị {pageCompensations.length}
          </p>
        </div>
        <Button data-testid="compensation-policy-link-button" variant="secondary" onClick={() => router.push("/compensations/policies")}>
          <ClipboardList className="w-4 h-4" />
          Compensation Policy
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <SearchToolbar
          search={
            <SearchInput
              data-testid="compensation-search-input"
              placeholder="Tìm theo mã, đối tác, đơn hàng, khách hàng hoặc sản phẩm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm("")}
            />
          }
        >
          <select
            data-testid="compensation-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">Tất cả loại</option>
            {COMPENSATION_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            data-testid="compensation-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {COMPENSATION_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button data-testid="compensation-clear-filters-button" variant="secondary" size="md" onClick={handleClearFilters}>
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Xóa bộ lọc</span>
            </Button>
          )}
          <Button data-testid="compensation-reload-button" variant="secondary" size="md" onClick={loadCompensations}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
          <Button data-testid="compensation-export-button" variant="secondary" size="md" onClick={handleExportCsv}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Xuất CSV</span>
          </Button>
        </SearchToolbar>
      </div>

      <CompensationTable
        compensations={pageCompensations}
        isLoading={isLoading}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Trang {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Trước
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
