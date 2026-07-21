"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import Select from "@/components/ui/Select";
import SegmentTable, { SegmentRow } from "@/components/marketing/SegmentTable";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import { getSegmentsPage, duplicateSegment, setSegmentStatus } from "@/lib/marketing/marketing.service";
import { SegmentFilters, SegmentType, SegmentStatus } from "@/types/marketing";
import { getCurrentStaff } from "@/lib/permission";
import ScopeIndicator from "@/components/shared/ScopeIndicator";

const TYPE_FILTER_OPTIONS = [
  { value: "All", label: "Tất cả loại" },
  { value: "Dynamic", label: "Động (Dynamic)" },
  { value: "Manual", label: "Thủ công (Manual)" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "Active", label: "Đang hoạt động" },
  { value: "Inactive", label: "Tạm ngưng" },
  { value: "Archived", label: "Đã lưu trữ" },
  { value: "All", label: "Tất cả trạng thái" },
];

export default function SegmentListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [segmentType, setSegmentType] = useState<SegmentType | "All">("All");
  const [status, setStatus] = useState<SegmentStatus | "All">("Active");
  const [page, setPage] = useState(1);

  async function load(filters: SegmentFilters) {
    setIsLoading(true);
    const result = await getSegmentsPage(filters);
    setRows(result.rows as SegmentRow[]);
    setTotalCount(result.totalCount);
    setIsLoading(false);
  }

  useEffect(() => {
    load({ search, segmentType, status, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, segmentType, status, page]);

  async function handleDuplicate(segment: SegmentRow) {
    const staff = await getCurrentStaff();
    const copy = await duplicateSegment(segment.id!, staff?.id ?? null);
    if (copy?.id) router.push(`/marketing/segments/${copy.id}/edit`);
  }

  async function handleToggleArchive(segment: SegmentRow) {
    const next = segment.status === "Archived" ? "Active" : "Archived";
    await setSegmentStatus(segment.id!, next);
    await load({ search, segmentType, status, page });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Phân khúc khách hàng</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2 flex-wrap">
            Nhóm khách hàng theo điều kiện động hoặc danh sách thủ công
            <ScopeIndicator resource="marketing" />
          </p>
        </div>
        <Button onClick={() => router.push("/marketing/segments/new")}>
          <Plus className="w-4 h-4" />
          Phân khúc mới
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchInput
            placeholder="Tìm theo tên phân khúc..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            onClear={() => {
              setPage(1);
              setSearch("");
            }}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            options={TYPE_FILTER_OPTIONS}
            value={segmentType}
            onChange={(e) => {
              setPage(1);
              setSegmentType(e.target.value as SegmentType | "All");
            }}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            options={STATUS_FILTER_OPTIONS}
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as SegmentStatus | "All");
            }}
          />
        </div>
      </div>

      <SegmentTable
        segments={rows}
        isLoading={isLoading}
        onEdit={(segment) => router.push(`/marketing/segments/${segment.id}/edit`)}
        onDuplicate={handleDuplicate}
        onToggleArchive={handleToggleArchive}
      />
      <MarketingPagination page={page} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
