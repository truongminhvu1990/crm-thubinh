"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Download, X, Handshake } from "lucide-react";
import { Partner } from "@/types/partner";
import { PARTNER_TYPE_OPTIONS, PARTNER_STATUS_OPTIONS } from "@/lib/partner/partner.constants";
import { exportPartnersToCsv } from "@/lib/partnerImportExport";
import PartnerTable, { PartnerSortKey, SortDir } from "@/components/partner/PartnerTable";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import SearchToolbar from "@/components/ui/SearchToolbar";

const PAGE_SIZE = 20;

export default function PartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [referredOrderCounts, setReferredOrderCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<PartnerSortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const hasActiveFilters = searchTerm !== "" || typeFilter !== "ALL" || statusFilter !== "ALL";

  async function loadPartners() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("partnerType", typeFilter);

      const res = await fetch(`/api/partners?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data: Partner[] = await res.json();
      setPartners(data);

      if (data.length > 0) {
        const countsRes = await fetch(`/api/partners/order-counts?ids=${data.map((p) => p.id).join(",")}`);
        const counts: Record<string, number> = countsRes.ok ? await countsRes.json() : {};
        setReferredOrderCounts(new Map(Object.entries(counts)));
      } else {
        setReferredOrderCounts(new Map());
      }
    } catch (error) {
      console.error("Failed to load partners:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, typeFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, typeFilter, statusFilter]);

  function handleSort(key: PartnerSortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleClearFilters() {
    setSearchTerm("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
  }

  function handleExportCsv() {
    const csv = exportPartnersToCsv(sortedPartners);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `doi-tac-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const sortedPartners = [...partners].sort((a, b) => {
    let diff = 0;
    if (sortKey === "name") diff = a.name.localeCompare(b.name);
    else diff = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    return sortDir === "asc" ? diff : -diff;
  });

  const totalPages = Math.max(1, Math.ceil(sortedPartners.length / PAGE_SIZE));
  const pagePartners = sortedPartners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" />
            Đối tác
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {partners.length} đối tác · Hiển thị {pagePartners.length}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <SearchToolbar
          search={
            <SearchInput
              data-testid="partner-search-input"
              placeholder="Tìm theo tên, mã, điện thoại hoặc email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm("")}
            />
          }
        >
          <select
            data-testid="partner-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">Tất cả loại đối tác</option>
            {PARTNER_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            data-testid="partner-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {PARTNER_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button data-testid="partner-clear-filters-button" variant="secondary" size="md" onClick={handleClearFilters}>
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Xóa bộ lọc</span>
            </Button>
          )}
          <Button data-testid="partner-reload-button" variant="secondary" size="md" onClick={loadPartners}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
          <Button data-testid="partner-export-button" variant="secondary" size="md" onClick={handleExportCsv}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Xuất CSV</span>
          </Button>
          <Button
            data-testid="partner-add-button"
            variant="primary"
            size="md"
            onClick={() => router.push("/partners/new")}
            className="whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Thêm đối tác
          </Button>
        </SearchToolbar>
      </div>

      <PartnerTable
        partners={pagePartners}
        referredOrderCounts={referredOrderCounts}
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
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
