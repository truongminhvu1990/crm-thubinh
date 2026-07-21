"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { MARKETING_PAGE_SIZE } from "@/lib/marketing/marketing.constants";
import Button from "@/components/ui/Button";

interface Props {
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

/** Same shape as components/salesLedger/SalesLedgerPagination.tsx,
 * parameterized for Marketing's page size - kept as its own component
 * (rather than generalizing the Sales Ledger one) since that component
 * isn't exported/shared today and this task's scope is Marketing only. */
export default function MarketingPagination({ page, totalCount, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / MARKETING_PAGE_SIZE));
  if (totalCount === 0) return null;

  const from = (page - 1) * MARKETING_PAGE_SIZE + 1;
  const to = Math.min(page * MARKETING_PAGE_SIZE, totalCount);

  return (
    <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
      <p className="text-sm text-muted-foreground">
        Hiển thị {from}–{to} / {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="w-4 h-4" />
          Trước
        </Button>
        <span className="text-sm text-muted-foreground px-2">
          Trang {page} / {totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Sau
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
