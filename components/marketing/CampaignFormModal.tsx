"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import { getActiveSegmentsForPicker } from "@/lib/marketing/marketing.service";
import { MarketingCampaign } from "@/types/marketing";
import { Option } from "@/lib/customer.constants";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    description: string;
    targetSegmentId: string;
    startDate: string;
    endDate: string;
    ownerStaffId: string;
  }) => Promise<void>;
  campaign?: MarketingCampaign | null;
}

/** Create/Edit Campaign (MARKETING_UI.md §5.2) - one Modal for both modes,
 * same convention as this codebase's other create/edit Modal flows. */
export default function CampaignFormModal({ open, onClose, onSave, campaign }: Props) {
  const staffOptions = useStaffOptions();
  const [segmentOptions, setSegmentOptions] = useState<Option[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetSegmentId, setTargetSegmentId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ownerStaffId, setOwnerStaffId] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getActiveSegmentsForPicker().then((segments) => {
      let options = segments.map((s) => ({ value: s.id, label: s.name }));
      // Editing an already-targeted segment that has since been archived
      // still needs to show in the list (MARKETING_UI.md §5.2).
      if (campaign?.target_segment && !options.some((o) => o.value === campaign.target_segment!.id)) {
        options = [{ value: campaign.target_segment.id, label: campaign.target_segment.name }, ...options];
      }
      setSegmentOptions(options);
    });

    setName(campaign?.name || "");
    setDescription(campaign?.description || "");
    setTargetSegmentId(campaign?.target_segment_id || "");
    setStartDate(campaign?.start_date || "");
    setEndDate(campaign?.end_date || "");
    setOwnerStaffId(campaign?.owner_staff_id || "");
    setError("");
  }, [open, campaign]);

  async function handleSubmit() {
    if (!name.trim() || !targetSegmentId || !startDate || !ownerStaffId) {
      setError("Vui lòng điền đầy đủ các trường bắt buộc.");
      return;
    }
    if (endDate && endDate < startDate) {
      setError("Ngày kết thúc không được trước ngày bắt đầu.");
      return;
    }
    setIsSaving(true);
    await onSave({ name, description, targetSegmentId, startDate, endDate, ownerStaffId });
    setIsSaving(false);
  }

  return (
    <Modal open={open} title={campaign ? "Sửa chiến dịch" : "Chiến dịch mới"} onClose={onClose}>
      <div className="space-y-4">
        <Input label="Tên chiến dịch" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select
          label="Phân khúc mục tiêu"
          options={segmentOptions}
          placeholder="Chọn phân khúc"
          value={targetSegmentId}
          onChange={(e) => setTargetSegmentId(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Ngày bắt đầu" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="Ngày kết thúc" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Select
          label="Phụ trách"
          options={staffOptions}
          placeholder="Chọn nhân viên"
          value={ownerStaffId}
          onChange={(e) => setOwnerStaffId(e.target.value)}
        />

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} isLoading={isSaving}>
            Lưu
          </Button>
        </div>
      </div>
    </Modal>
  );
}
