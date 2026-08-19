"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X, PackageSearch, Plus } from "lucide-react";
import { ConsignmentSettlement } from "@/types/consignmentSettlement";
import { CONSIGNMENT_SETTLEMENT_STATUS_OPTIONS } from "@/lib/consignment/consignmentSettlement.constants";
import ConsignmentSettlementTable, {
  ConsignmentSettlementSortKey,
  SortDir,
} from "@/components/consignment/ConsignmentSettlementTable";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import SearchToolbar from "@/components/ui/SearchToolbar";

const PAGE_SIZE = 20;

export default function ConsignmentSettlementsPage() {
  const router = useRouter();
  const [settlements, setSettlements] = useState<ConsignmentSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<ConsignmentSettlementSortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "ALL";

  async function loadSettlements() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/consignment-settlements?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      setSettlements(await res.json());
    } catch (error) {
      console.error("Failed to load consignment settlements:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  function handleSort(key: ConsignmentSettlementSortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleClearFilters() {
    setSearchTerm("");
    setStatusFilter("ALL");
  }

  const sortedSettlements = [...settlements].sort((a, b) => {
    const aTime = new Date((sortKey === "requested_at" ? a.requested_at : a.created_at) ?? 0).getTime();
    const bTime = new Date((sortKey === "requested_at" ? b.requested_at : b.created_at) ?? 0).getTime();
    const diff = aTime - bTime;
    return sortDir === "asc" ? diff : -diff;
  });

  const totalPages = Math.max(1, Math.ceil(sortedSettlements.length / PAGE_SIZE));
  const pageSettlements = sortedSettlements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <PackageSearch className="w-6 h-6 text-primary" />
            Consignment Settlement
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {settlements.length} settlement · Hiển thị {pageSettlements.length}
          </p>
        </div>
        <Button data-testid="consignment-settlement-new-button" onClick={() => router.push("/consignment-settlements/new")}>
          <Plus className="w-4 h-4" />
          Tạo Consignment Settlement
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <SearchToolbar
          search={
            <SearchInput
              data-testid="consignment-settlement-search-input"
              placeholder="Tìm theo mã hoặc khách hàng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm("")}
            />
          }
        >
          <select
            data-testid="consignment-settlement-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {CONSIGNMENT_SETTLEMENT_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button data-testid="consignment-settlement-clear-filters-button" variant="secondary" size="md" onClick={handleClearFilters}>
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Xóa bộ lọc</span>
            </Button>
          )}
          <Button data-testid="consignment-settlement-reload-button" variant="secondary" size="md" onClick={loadSettlements}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
        </SearchToolbar>
      </div>

      <ConsignmentSettlementTable
        settlements={pageSettlements}
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
