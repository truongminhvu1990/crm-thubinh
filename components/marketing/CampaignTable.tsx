"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { MarketingCampaign, CampaignStatus } from "@/types/marketing";
import CampaignStatusBadge from "./CampaignStatusBadge";
import Select from "@/components/ui/Select";
import { getValidNextStatuses } from "@/lib/marketing/marketing.service";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { formatDate } from "@/lib/utils";

interface Props {
  campaigns: MarketingCampaign[];
  isLoading?: boolean;
  onEdit: (campaign: MarketingCampaign) => void;
  onStatusChange: (campaign: MarketingCampaign, next: CampaignStatus) => void;
}

export default function CampaignTable({ campaigns, isLoading = false, onEdit, onStatusChange }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Megaphone className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có chiến dịch nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[1000px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tên</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phân khúc mục tiêu</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phụ trách</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bắt đầu</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kết thúc</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const nextOptions = getValidNextStatuses(campaign.status);
            return (
              <tr key={campaign.id} className="border-b border-border last:border-0 hover:bg-muted/30 group">
                <td className="px-5 py-3.5">
                  <Link href={`/marketing/campaigns/${campaign.id}`} className="font-medium text-foreground hover:text-primary">
                    {campaign.name}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-sm">
                  {campaign.target_segment ? (
                    <Link href={`/marketing/segments/${campaign.target_segment.id}`} className="text-primary hover:underline">
                      {campaign.target_segment.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-sm text-foreground">{campaign.owner?.full_name || "—"}</td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground">{formatDate(campaign.start_date)}</td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground">{campaign.end_date ? formatDate(campaign.end_date) : "—"}</td>
                <td className="px-5 py-3.5">
                  <CampaignStatusBadge status={campaign.status} />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="text-xs text-muted-foreground hover:text-primary"
                      onClick={() => onEdit(campaign)}
                    >
                      Sửa
                    </button>
                    {nextOptions.length > 0 && (
                      <Select
                        options={CAMPAIGN_STATUS_OPTIONS.filter((o) => nextOptions.includes(o.value))}
                        placeholder="Đổi trạng thái"
                        className="text-xs py-1"
                        onChange={(e) => e.target.value && onStatusChange(campaign, e.target.value as CampaignStatus)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
