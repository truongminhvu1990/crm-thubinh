"use client";

import { X, ArrowUpDown } from "lucide-react";
import { SalesLedgerFilters as Filters, SalesLedgerSortField } from "@/types/salesLedger";
import { COMMISSION_STATUS_OPTIONS } from "@/lib/commission/commission.constants";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import SearchInput from "@/components/ui/SearchInput";
import SearchToolbar from "@/components/ui/SearchToolbar";
import Button from "@/components/ui/Button";
import CurrencyInput from "@/components/ui/CurrencyInput";

const SORT_OPTIONS: { value: SalesLedgerSortField; label: string }[] = [
  { value: "sale_date", label: "Ngày bán" },
  { value: "sale_amount", label: "Giá trị bán" },
  { value: "commission_amount", label: "Hoa hồng" },
];

const inputClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function SalesLedgerFilters({ filters, onChange }: Props) {
  const categoryOptions = useMasterDataOptions("product_category");
  const staffOptions = useStaffOptions();

  const hasActiveFilters = !!(
    filters.search ||
    filters.customer ||
    filters.salespersonId ||
    filters.productCode ||
    filters.productName ||
    filters.productCategory ||
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined ||
    filters.commissionStatus
  );

  function update(patch: Partial<Filters>) {
    onChange({ ...filters, ...patch, page: 1 });
  }

  function clearFilters() {
    onChange({
      sortField: filters.sortField,
      sortDirection: filters.sortDirection,
      page: 1,
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6 space-y-3">
      <SearchToolbar
        search={
          <SearchInput
            data-testid="sales-ledger-search-input"
            placeholder="Tìm theo khách hàng, mã hoặc tên sản phẩm..."
            value={filters.search || ""}
            onChange={(e) => update({ search: e.target.value || undefined })}
            onClear={() => update({ search: undefined })}
          />
        }
      >
        <div className="flex items-center gap-2">
          <select
            value={filters.sortField}
            onChange={(e) => update({ sortField: e.target.value as SalesLedgerSortField })}
            className={inputClass}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => update({ sortDirection: filters.sortDirection === "asc" ? "desc" : "asc" })}
            className={`${inputClass} inline-flex items-center gap-1.5`}
            title={filters.sortDirection === "asc" ? "Cũ nhất trước" : "Mới nhất trước"}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {filters.sortDirection === "asc" ? "Cũ nhất" : "Mới nhất"}
          </button>
        </div>
      </SearchToolbar>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Khách hàng..."
          value={filters.customer || ""}
          onChange={(e) => update({ customer: e.target.value || undefined })}
          className={`${inputClass} w-40`}
        />

        <select
          value={filters.salespersonId || ""}
          onChange={(e) => update({ salespersonId: e.target.value || undefined })}
          className={`${inputClass} w-48`}
        >
          <option value="">Tất cả nhân viên</option>
          {staffOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <input
          placeholder="Mã sản phẩm..."
          value={filters.productCode || ""}
          onChange={(e) => update({ productCode: e.target.value || undefined })}
          className={`${inputClass} w-36`}
        />

        <input
          placeholder="Tên sản phẩm..."
          value={filters.productName || ""}
          onChange={(e) => update({ productName: e.target.value || undefined })}
          className={`${inputClass} w-40`}
        />

        <select
          value={filters.productCategory || ""}
          onChange={(e) => update({ productCategory: e.target.value || undefined })}
          className={`${inputClass} w-40`}
        >
          <option value="">Tất cả danh mục</option>
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <CurrencyInput
          placeholder="Giá trị từ..."
          value={filters.minAmount}
          onChange={(value) => update({ minAmount: value })}
          className="w-32"
        />
        <CurrencyInput
          placeholder="Giá trị đến..."
          value={filters.maxAmount}
          onChange={(value) => update({ maxAmount: value })}
          className="w-32"
        />

        <select
          value={filters.commissionStatus || ""}
          onChange={(e) => update({ commissionStatus: (e.target.value || undefined) as Filters["commissionStatus"] })}
          className={`${inputClass} w-44`}
        >
          <option value="">Mọi trạng thái hoa hồng</option>
          {COMMISSION_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <Button variant="secondary" size="md" onClick={clearFilters}>
            <X className="w-4 h-4" />
            Xóa bộ lọc
          </Button>
        )}
      </div>
    </div>
  );
}
