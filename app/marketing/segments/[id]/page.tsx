"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Edit2, Copy, Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import { SegmentTypeBadge, SegmentStatusBadge } from "@/components/marketing/SegmentBadges";
import CampaignStatusBadge from "@/components/marketing/CampaignStatusBadge";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import {
  getSegmentDetail,
  duplicateSegment,
  setSegmentStatus,
  getSegmentMembersPage,
  SegmentDetail,
} from "@/lib/marketing/marketing.service";
import { getCurrentStaff } from "@/lib/permission";
import { MarketingSegmentMember } from "@/types/marketing";
import { SEGMENT_CONDITION_FIELDS, SEGMENT_CONDITION_OPERATOR_LABELS } from "@/lib/marketing/marketing.constants";
import { formatDate } from "@/lib/utils";

export default function SegmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [detail, setDetail] = useState<SegmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<MarketingSegmentMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [memberTotal, setMemberTotal] = useState(0);

  async function load() {
    setIsLoading(true);
    const data = await getSegmentDetail(id);
    setDetail(data);
    if (data?.segment.segment_type === "Manual") {
      const page = await getSegmentMembersPage(id, memberPage, memberSearch || undefined);
      setMembers(page.rows);
      setMemberTotal(page.totalCount);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (detail?.segment.segment_type !== "Manual") return;
    getSegmentMembersPage(id, memberPage, memberSearch || undefined).then((page) => {
      setMembers(page.rows);
      setMemberTotal(page.totalCount);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberPage, memberSearch]);

  async function handleDuplicate() {
    const staff = await getCurrentStaff();
    const copy = await duplicateSegment(id, staff?.id ?? null);
    if (copy?.id) router.push(`/marketing/segments/${copy.id}/edit`);
  }

  async function handleToggleArchive() {
    if (!detail) return;
    const next = detail.segment.status === "Archived" ? "Active" : "Archived";
    await setSegmentStatus(id, next);
    await load();
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground mb-3">Không tìm thấy phân khúc.</p>
        <Link href="/marketing/segments" className="text-sm text-primary hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const { segment, conditions, customerCount, estimatedReach, campaigns } = detail;

  return (
    <div className="p-6 space-y-6">
      <button onClick={() => router.push("/marketing/segments")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Quay lại danh sách phân khúc
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground">{segment.name}</h1>
            <SegmentTypeBadge type={segment.segment_type} />
            <SegmentStatusBadge status={segment.status} />
          </div>
          {segment.description && <p className="text-muted-foreground text-sm mt-1">{segment.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push(`/marketing/segments/${id}/edit`)}>
            <Edit2 className="w-4 h-4" />
            Sửa
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDuplicate}>
            <Copy className="w-4 h-4" />
            Nhân bản
          </Button>
          <Button variant="secondary" size="sm" onClick={handleToggleArchive}>
            {segment.status === "Archived" ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            {segment.status === "Archived" ? "Khôi phục" : "Lưu trữ"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Card>
          <p className="text-muted-foreground text-sm">Số khách hàng</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{customerCount}</p>
        </Card>
        <Card>
          <p className="text-muted-foreground text-sm">Phạm vi tiếp cận ước tính</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{estimatedReach}</p>
        </Card>
      </div>

      {segment.segment_type === "Dynamic" ? (
        <Card>
          <h3 className="font-semibold text-foreground mb-3">
            Điều kiện ({segment.condition_logic === "OR" ? "Bất kỳ (OR)" : "Tất cả (AND)"})
          </h3>
          {conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có điều kiện - áp dụng cho tất cả khách hàng</p>
          ) : (
            <div className="space-y-2">
              {conditions.map((c) => (
                <div key={c.id} className="text-sm text-foreground bg-muted/30 rounded-md px-3 py-2">
                  <span className="font-medium">{SEGMENT_CONDITION_FIELDS[c.field]?.label || c.field}</span>{" "}
                  <span className="text-muted-foreground">{SEGMENT_CONDITION_OPERATOR_LABELS[c.operator] || c.operator}</span>{" "}
                  <span>{Array.isArray(c.value) ? c.value.join(" - ") : String(c.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h3 className="font-semibold text-foreground">Khách hàng trong phân khúc</h3>
            <div className="w-64">
              <SearchInput
                placeholder="Tìm khách hàng..."
                value={memberSearch}
                onChange={(e) => {
                  setMemberPage(1);
                  setMemberSearch(e.target.value);
                }}
                onClear={() => {
                  setMemberPage(1);
                  setMemberSearch("");
                }}
              />
            </div>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có khách hàng nào trong phân khúc này</p>
          ) : (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.customer_id} className="text-sm text-foreground px-3 py-2 rounded-md hover:bg-muted/30">
                  {m.customer?.full_name} <span className="text-muted-foreground">· {m.customer?.customer_code} · {m.customer?.phone}</span>
                </div>
              ))}
            </div>
          )}
          <MarketingPagination page={memberPage} totalCount={memberTotal} onPageChange={setMemberPage} />
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-foreground mb-3">Chiến dịch nhắm đến phân khúc này</h3>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có chiến dịch nào nhắm đến phân khúc này</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/marketing/campaigns/${c.id}`}
                className="flex items-center justify-between text-sm px-3 py-2 rounded-md hover:bg-muted/30"
              >
                <span className="text-foreground font-medium">{c.name}</span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  {formatDate(c.start_date)} - {c.end_date ? formatDate(c.end_date) : "—"}
                  <CampaignStatusBadge status={c.status} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
