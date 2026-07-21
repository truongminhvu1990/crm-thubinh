"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import Select from "@/components/ui/Select";
import CampaignTable from "@/components/marketing/CampaignTable";
import CampaignFormModal from "@/components/marketing/CampaignFormModal";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import { getCampaignsPage, createCampaign, updateCampaignDetails, changeCampaignStatus } from "@/lib/marketing/marketing.service";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import { CampaignFilters, CampaignStatus, MarketingCampaign } from "@/types/marketing";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import ScopeIndicator from "@/components/shared/ScopeIndicator";

const STATUS_FILTER_OPTIONS = [{ value: "All", label: "Tất cả trạng thái" }, ...CAMPAIGN_STATUS_OPTIONS];

export default function CampaignListPage() {
  const [rows, setRows] = useState<MarketingCampaign[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CampaignStatus | "All">("All");
  const [ownerStaffId, setOwnerStaffId] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const staffOptions = useStaffOptions();

  async function load(filters: CampaignFilters) {
    setIsLoading(true);
    const result = await getCampaignsPage(filters);
    setRows(result.rows);
    setTotalCount(result.totalCount);
    setIsLoading(false);
  }

  useEffect(() => {
    load({ search, status, ownerStaffId: ownerStaffId || undefined, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, ownerStaffId, page]);

  async function handleSave(input: {
    name: string;
    description: string;
    targetSegmentId: string;
    startDate: string;
    endDate: string;
    ownerStaffId: string;
  }) {
    if (editingCampaign) {
      await updateCampaignDetails(editingCampaign.id!, {
        name: input.name,
        description: input.description,
        targetSegmentId: input.targetSegmentId,
        startDate: input.startDate,
        endDate: input.endDate || null,
        ownerStaffId: input.ownerStaffId,
      });
    } else {
      await createCampaign({
        name: input.name,
        description: input.description,
        targetSegmentId: input.targetSegmentId,
        startDate: input.startDate,
        endDate: input.endDate || null,
        ownerStaffId: input.ownerStaffId,
      });
    }
    setModalOpen(false);
    setEditingCampaign(null);
    await load({ search, status, ownerStaffId: ownerStaffId || undefined, page });
  }

  async function handleStatusChange(campaign: MarketingCampaign, next: CampaignStatus) {
    await changeCampaignStatus(campaign.id!, campaign.status, next);
    await load({ search, status, ownerStaffId: ownerStaffId || undefined, page });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Chiến dịch</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2 flex-wrap">
            Lập kế hoạch và theo dõi chiến dịch marketing
            <ScopeIndicator resource="marketing" />
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingCampaign(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Chiến dịch mới
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchInput
            placeholder="Tìm theo tên chiến dịch..."
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
            options={STATUS_FILTER_OPTIONS}
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as CampaignStatus | "All");
            }}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            options={[{ value: "", label: "Tất cả phụ trách" }, ...staffOptions]}
            value={ownerStaffId}
            onChange={(e) => {
              setPage(1);
              setOwnerStaffId(e.target.value);
            }}
          />
        </div>
      </div>

      <CampaignTable
        campaigns={rows}
        isLoading={isLoading}
        onEdit={(campaign) => {
          setEditingCampaign(campaign);
          setModalOpen(true);
        }}
        onStatusChange={handleStatusChange}
      />
      <MarketingPagination page={page} totalCount={totalCount} onPageChange={setPage} />

      <CampaignFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingCampaign(null);
        }}
        onSave={handleSave}
        campaign={editingCampaign}
      />
    </div>
  );
}
