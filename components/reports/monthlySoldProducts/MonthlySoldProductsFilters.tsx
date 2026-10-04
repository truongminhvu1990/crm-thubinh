"use client";

import { X } from "lucide-react";
import { MonthlySoldProductsFilters as Filters } from "@/types/monthlySoldProducts";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import SearchInput from "@/components/ui/SearchInput";
import Button from "@/components/ui/Button";

const inputClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

/** Phase 1.6B: the reporting period is the app's Global Date Filter (rendered by the page), so this bar only holds the
 * non-date filters. The old own From/To and Month controls are gone. */
export default function MonthlySoldProductsFilters({ filters, onChange }: Props) {
  const categoryOptions = useMasterDataOptions("product_category");
  const staffOptions = useStaffOptions();

  const hasActiveFilters = !!(
    filters.salespersonId ||
    filters.productCategory ||
    filters.customer
  );

  function update(patch: Partial<Filters>) {
    onChange({ ...filters, ...patch, page: 1 });
  }

  function clearFilters() {
    onChange({ page: 1 });
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput
          placeholder="Tìm theo khách hàng..."
          value={filters.customer || ""}
          onChange={(e) => update({ customer: e.target.value || undefined, month: undefined })}
          onClear={() => update({ customer: undefined })}
          className="w-56"
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
