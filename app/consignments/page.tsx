"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X, PackageOpen, Plus } from "lucide-react";
import { ConsignmentOverviewRow } from "@/types/consignmentOverview";
import { CONSIGNMENT_STATUS_OPTIONS } from "@/lib/consignment/consignment.constants";
import ConsignmentTable from "@/components/consignment/ConsignmentTable";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import SearchToolbar from "@/components/ui/SearchToolbar";

export default function ConsignmentsPage() {
  const router = useRouter();
  const [consignments, setConsignments] = useState<ConsignmentOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "ALL";

  async function loadConsignments() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/consignments?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      setConsignments(await res.json());
    } catch (error) {
      console.error("Failed to load consignments:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadConsignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter]);

  function handleClearFilters() {
    setSearchTerm("");
    setStatusFilter("ALL");
  }

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <PackageOpen className="w-6 h-6 text-primary" />
            Consignment
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{consignments.length} consignment</p>
        </div>
        <Button data-testid="consignment-new-button" onClick={() => router.push("/consignments/new")}>
          <Plus className="w-4 h-4" />
          Nhận hàng ký gửi
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <SearchToolbar
          search={
            <SearchInput
              data-testid="consignment-search-input"
              placeholder="Tìm theo mã, khách hàng hoặc sản phẩm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm("")}
            />
          }
        >
          <select
            data-testid="consignment-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {CONSIGNMENT_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button data-testid="consignment-clear-filters-button" variant="secondary" size="md" onClick={handleClearFilters}>
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Xóa bộ lọc</span>
            </Button>
          )}
          <Button data-testid="consignment-reload-button" variant="secondary" size="md" onClick={loadConsignments}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
        </SearchToolbar>
      </div>

      <ConsignmentTable consignments={consignments} isLoading={isLoading} />
    </div>
  );
}
