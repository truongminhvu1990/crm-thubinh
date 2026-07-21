"use client";

import { X } from "lucide-react";
import { SalesLedgerFilters as Filters } from "@/types/salesLedger";
import Button from "@/components/ui/Button";

// Data Verification Center (Sprint v2.3.0), Feature 7. Shared between
// Sales Ledger's Verification Mode and the Data Verification Center page -
// one component, one set of filter fields, both consumers read/write the
// exact same SalesLedgerFilters object Feature 1's toggle already extends.
// "Historical Only" / "Live Only" are the same `entrySource` field as
// "Entry Source" (folded into one select, not three separate controls).

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const inputClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function VerificationFilters({ filters, onChange }: Props) {
  const hasActiveFilters = !!(filters.entrySource || filters.createdBy || filters.updatedBy || filters.duplicateOnly);

  function update(patch: Partial<Filters>) {
    onChange({ ...filters, ...patch, page: 1 });
  }

  function clearVerificationFilters() {
    update({ entrySource: undefined, createdBy: undefined, updatedBy: undefined, duplicateOnly: undefined });
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filters.entrySource || ""}
          onChange={(e) => update({ entrySource: (e.target.value || undefined) as Filters["entrySource"] })}
          className={`${inputClass} w-52`}
        >
          <option value="">Tất cả nguồn nhập (Entry Source)</option>
          <option value="Live Sale">Chỉ Live Sale</option>
          <option value="Historical Import">Chỉ Historical Import</option>
        </select>

        <input
          placeholder="Người tạo (Created By)..."
          value={filters.createdBy || ""}
          onChange={(e) => update({ createdBy: e.target.value || undefined })}
          className={`${inputClass} w-48`}
        />

        <input
          placeholder="Người cập nhật (Updated By)..."
          value={filters.updatedBy || ""}
          onChange={(e) => update({ updatedBy: e.target.value || undefined })}
          className={`${inputClass} w-48`}
        />

        <label className="inline-flex items-center gap-2 text-sm text-foreground select-none">
          <input
            type="checkbox"
            checked={!!filters.duplicateOnly}
            onChange={(e) => update({ duplicateOnly: e.target.checked || undefined })}
            className="rounded border-input"
          />
          Chỉ hiển thị nghi ngờ trùng lặp (Duplicate Only)
        </label>

        {hasActiveFilters && (
          <Button variant="secondary" size="sm" onClick={clearVerificationFilters}>
            <X className="w-4 h-4" />
            Xóa bộ lọc xác minh
          </Button>
        )}
      </div>
    </div>
  );
}
