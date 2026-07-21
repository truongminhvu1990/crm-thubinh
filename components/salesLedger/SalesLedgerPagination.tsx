"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { SALES_LEDGER_PAGE_SIZE } from "@/types/salesLedger";
import Button from "@/components/ui/Button";

interface Props {
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export default function SalesLedgerPagination({ page, totalCount, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / SALES_LEDGER_PAGE_SIZE));
  if (totalCount === 0) return null;

  const from = (page - 1) * SALES_LEDGER_PAGE_SIZE + 1;
  const to = Math.min(page * SALES_LEDGER_PAGE_SIZE, totalCount);

  return (
    <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
      <p className="text-sm text-muted-foreground">
        Hiển thị {from}–{to} / {totalCount} giao dịch
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
