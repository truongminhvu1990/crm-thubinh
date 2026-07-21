"use client";

import { X } from "lucide-react";
import { CommissionListFilters } from "@/types/commission";
import { COMMISSION_STATUS_OPTIONS } from "@/lib/commission/commission.constants";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import Button from "@/components/ui/Button";

interface Props {
  filters: CommissionListFilters;
  onChange: (filters: CommissionListFilters) => void;
}

export default function CommissionFilters({ filters, onChange }: Props) {
  const salespersonOptions = useMasterDataOptions("salesperson");
  const hasActiveFilters = !!(filters.dateFrom || filters.dateTo || filters.salesperson || filters.status);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Từ ngày</label>
          <input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Đến ngày</label>
          <input
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <select
          value={filters.salesperson || ""}
          onChange={(e) => onChange({ ...filters, salesperson: e.target.value || undefined })}
          className="w-48 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Tất cả nhân viên</option>
          {salespersonOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={filters.status || ""}
          onChange={(e) =>
            onChange({ ...filters, status: (e.target.value || undefined) as CommissionListFilters["status"] })
          }
          className="w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Tất cả trạng thái</option>
          {COMMISSION_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <Button variant="secondary" size="md" onClick={() => onChange({})}>
            <X className="w-4 h-4" />
            Xóa bộ lọc
          </Button>
        )}
      </div>
    </div>
  );
}
