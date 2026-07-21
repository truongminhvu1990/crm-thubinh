"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Edit2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import CampaignStatusBadge from "@/components/marketing/CampaignStatusBadge";
import CampaignFormModal from "@/components/marketing/CampaignFormModal";
import {
  getCampaignDetail,
  updateCampaignDetails,
  changeCampaignStatus,
  getValidNextStatuses,
} from "@/lib/marketing/marketing.service";
import { MarketingCampaign, CampaignStatus } from "@/types/marketing";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { formatDate } from "@/lib/utils";

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setIsLoading(true);
    const data = await getCampaignDetail(id);
    setCampaign(data);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(input: {
    name: string;
    description: string;
    targetSegmentId: string;
    startDate: string;
    endDate: string;
    ownerStaffId: string;
  }) {
    await updateCampaignDetails(id, {
      name: input.name,
      description: input.description,
      targetSegmentId: input.targetSegmentId,
      startDate: input.startDate,
      endDate: input.endDate || null,
      ownerStaffId: input.ownerStaffId,
    });
    setModalOpen(false);
    await load();
  }

  async function handleStatusChange(next: CampaignStatus) {
    if (!campaign) return;
    await changeCampaignStatus(id, campaign.status, next);
    await load();
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground mb-3">Không tìm thấy chiến dịch.</p>
        <Link href="/marketing/campaigns" className="text-sm text-primary hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const nextOptions = getValidNextStatuses(campaign.status);

  return (
    <div className="p-6 space-y-6">
      <button onClick={() => router.push("/marketing/campaigns")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Quay lại danh sách chiến dịch
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nextOptions.length > 0 && (
            <Select
              options={CAMPAIGN_STATUS_OPTIONS.filter((o) => nextOptions.includes(o.value))}
              placeholder="Đổi trạng thái"
              onChange={(e) => e.target.value && handleStatusChange(e.target.value as CampaignStatus)}
            />
          )}
          <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
            <Edit2 className="w-4 h-4" />
            Sửa
          </Button>
        </div>
      </div>

      <Card className="space-y-3 max-w-2xl">
        {campaign.description && <p className="text-sm text-foreground">{campaign.description}</p>}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Phân khúc mục tiêu</p>
            {campaign.target_segment ? (
              <Link href={`/marketing/segments/${campaign.target_segment.id}`} className="text-primary hover:underline">
                {campaign.target_segment.name}
              </Link>
            ) : (
              "—"
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Phụ trách</p>
            <p className="text-foreground">{campaign.owner?.full_name || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ngày bắt đầu</p>
            <p className="text-foreground">{formatDate(campaign.start_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ngày kết thúc</p>
            <p className="text-foreground">{campaign.end_date ? formatDate(campaign.end_date) : "—"}</p>
          </div>
        </div>
      </Card>

      <Card className="max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Số liệu gửi tin/tương tác sẽ hiển thị tại đây khi Trung tâm Gửi tin được kích hoạt.
        </p>
      </Card>

      <CampaignFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} campaign={campaign} />
    </div>
  );
}
