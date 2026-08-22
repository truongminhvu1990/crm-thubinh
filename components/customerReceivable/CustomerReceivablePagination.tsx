"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { CUSTOMER_RECEIVABLE_PAGE_SIZE } from "@/types/customerReceivable";
import Button from "@/components/ui/Button";

interface Props {
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

/** Same shape as MonthlySoldProductsPagination, kept as its own small
 * component rather than reused directly — that one hardcodes
 * MONTHLY_SOLD_PRODUCTS_PAGE_SIZE, an unrelated report's own page size
 * constant, so sharing it would silently couple Customer Receivable's
 * pagination to a page size it doesn't own. */
export default function CustomerReceivablePagination({ page, totalCount, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMER_RECEIVABLE_PAGE_SIZE));
  if (totalCount === 0) return null;

  const from = (page - 1) * CUSTOMER_RECEIVABLE_PAGE_SIZE + 1;
  const to = Math.min(page * CUSTOMER_RECEIVABLE_PAGE_SIZE, totalCount);

  return (
    <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
      <p className="text-sm text-muted-foreground">
        Hiển thị {from}–{to} / {totalCount} đơn hàng
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
