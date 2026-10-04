"use client";

// Phase 1.6B - the counterpart of PageViewingLabel for screens that are NOT period-based (current balances / current
// stock / aging). They must never show the Global Date Filter's period, because it would falsely suggest the numbers
// follow it.

interface Props {
  /** Optional clarification shown after the label (e.g. that a page-local date filter is independent of the report period). */
  note?: string;
}

export default function CurrentStateLabel({ note }: Props) {
  return (
    <p className="text-sm font-medium text-foreground" data-testid="current-state-label">
      Đang xem: <span className="text-primary">Trạng thái hiện tại</span>
      <span className="ml-2 font-normal text-muted-foreground">{note ?? "(không phụ thuộc Kỳ báo cáo)"}</span>
    </p>
  );
}
