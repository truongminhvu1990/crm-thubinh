"use client";

import Badge from "@/components/ui/Badge";
import { SegmentType, SegmentStatus } from "@/types/marketing";
import { BadgeVariant } from "@/lib/customer.constants";

const SEGMENT_TYPE_LABEL: Record<SegmentType, string> = {
  Dynamic: "Động",
  Manual: "Thủ công",
};

const SEGMENT_TYPE_VARIANT: Record<SegmentType, BadgeVariant> = {
  Dynamic: "default",
  Manual: "secondary",
};

export function SegmentTypeBadge({ type }: { type: SegmentType }) {
  return <Badge variant={SEGMENT_TYPE_VARIANT[type]}>{SEGMENT_TYPE_LABEL[type]}</Badge>;
}

const SEGMENT_STATUS_LABEL: Record<SegmentStatus, string> = {
  Active: "Đang hoạt động",
  Inactive: "Tạm ngưng",
  Archived: "Đã lưu trữ",
};

const SEGMENT_STATUS_VARIANT: Record<SegmentStatus, BadgeVariant> = {
  Active: "success",
  Inactive: "warning",
  Archived: "muted",
};

export function SegmentStatusBadge({ status }: { status: SegmentStatus }) {
  return <Badge variant={SEGMENT_STATUS_VARIANT[status]}>{SEGMENT_STATUS_LABEL[status]}</Badge>;
}
