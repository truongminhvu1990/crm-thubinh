"use client";

import Link from "next/link";
import { Users, Edit2, Copy, Archive, ArchiveRestore } from "lucide-react";
import { MarketingSegment } from "@/types/marketing";
import { SegmentTypeBadge, SegmentStatusBadge } from "./SegmentBadges";
import { formatDate } from "@/lib/utils";

export interface SegmentRow extends MarketingSegment {
  customerCount: number;
}

interface Props {
  segments: SegmentRow[];
  isLoading?: boolean;
  onEdit: (segment: SegmentRow) => void;
  onDuplicate: (segment: SegmentRow) => void;
  onToggleArchive: (segment: SegmentRow) => void;
}

export default function SegmentTable({ segments, isLoading = false, onEdit, onDuplicate, onToggleArchive }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Users className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có phân khúc khách hàng nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tên</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loại</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Số khách hàng</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cập nhật</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"></th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => (
            <tr key={segment.id} className="border-b border-border last:border-0 hover:bg-muted/30 group">
              <td className="px-5 py-3.5">
                <Link href={`/marketing/segments/${segment.id}`} className="font-medium text-foreground hover:text-primary">
                  {segment.name}
                </Link>
                {segment.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{segment.description}</p>}
              </td>
              <td className="px-5 py-3.5">
                <SegmentTypeBadge type={segment.segment_type} />
              </td>
              <td className="px-5 py-3.5">
                <SegmentStatusBadge status={segment.status} />
              </td>
              <td className="px-5 py-3.5 text-sm text-foreground">{segment.customerCount}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{segment.updated_at ? formatDate(segment.updated_at) : "—"}</td>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
                    title="Sửa"
                    onClick={() => onEdit(segment)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
                    title="Nhân bản"
                    onClick={() => onDuplicate(segment)}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title={segment.status === "Archived" ? "Khôi phục" : "Lưu trữ"}
                    onClick={() => onToggleArchive(segment)}
                  >
                    {segment.status === "Archived" ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
