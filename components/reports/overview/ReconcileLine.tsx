"use client";

import { CircleCheck, TriangleAlert, Loader } from "lucide-react";
import { currency } from "@/lib/reports/format";
import type { ReconcileView } from "@/lib/reports/overviewUi";

interface Props {
  view: ReconcileView;
  detailTotal: number;
  overviewTotal: number | null;
  /** e.g. "10 sản phẩm" - shown only in the match sentence. */
  countLabel: string;
}

/** The "Tổng chi tiết = tổng quan" line. A mismatch is reported ONLY when both
 * numbers are really available and really differ; a source that has not
 * loaded (or failed to load) is shown neutrally, never as a discrepancy. */
export default function ReconcileLine({ view, detailTotal, overviewTotal, countLabel }: Props) {
  if (view === "match") {
    return (
      <p className="flex items-center gap-2" data-reconcile="match">
        <CircleCheck className="h-4 w-4 text-emerald-600" />
        <span>
          Tổng chi tiết {currency.format(detailTotal)} ({countLabel}) = tổng quan {currency.format(overviewTotal ?? 0)}
        </span>
      </p>
    );
  }
  if (view === "mismatch") {
    return (
      <p className="flex items-center gap-2" data-reconcile="mismatch">
        <TriangleAlert className="h-4 w-4 text-destructive" />
        <span className="font-medium text-destructive">
          Chi tiết {currency.format(detailTotal)} KHÁC tổng quan {currency.format(overviewTotal ?? 0)} — cần báo cáo, không tự điều chỉnh
        </span>
      </p>
    );
  }
  if (view === "unavailable") {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" data-reconcile="unavailable">
        <TriangleAlert className="h-4 w-4 text-amber-600" />
        <span>Chưa đối soát được với tổng quan vì tổng quan không tải được.</span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-muted-foreground" data-reconcile="pending">
      <Loader className="h-4 w-4" />
      <span>Đang đối soát với tổng quan…</span>
    </p>
  );
}
