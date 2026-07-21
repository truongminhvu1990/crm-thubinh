"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import Select from "@/components/ui/Select";
import SegmentConditionRow, { DraftCondition } from "./SegmentConditionRow";
import SegmentLivePreview from "./SegmentLivePreview";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import { getCustomers } from "@/lib/customer.service";
import { Customer } from "@/types/customer";
import {
  getSegmentDetail,
  createDynamicSegment,
  createManualSegment,
  updateDynamicSegment,
  updateManualSegmentInfo,
  addCustomersToManualSegment,
  removeCustomerFromManualSegment,
  getSegmentMembersPage,
} from "@/lib/marketing/marketing.service";
import { getCurrentStaff } from "@/lib/permission";
import { SEGMENT_TEMPLATES, SEGMENT_TYPE_OPTIONS } from "@/lib/marketing/marketing.constants";
import { ConditionLogic, SegmentType, MarketingSegmentMember } from "@/types/marketing";

interface Props {
  segmentId?: string;
}

const CONDITION_LOGIC_OPTIONS = [
  { value: "AND", label: "Tất cả điều kiện (AND)" },
  { value: "OR", label: "Bất kỳ điều kiện nào (OR)" },
];

export default function SegmentBuilderForm({ segmentId }: Props) {
  const router = useRouter();
  const isEditing = !!segmentId;
  const staffOptions = useStaffOptions();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [segmentType, setSegmentType] = useState<SegmentType>("Dynamic");
  const [conditionLogic, setConditionLogic] = useState<ConditionLogic>("AND");
  const [conditions, setConditions] = useState<DraftCondition[]>([]);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);

  // Manual segment member picker state.
  const [members, setMembers] = useState<MarketingSegmentMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);

  useEffect(() => {
    if (!segmentId) return;
    (async () => {
      setIsLoading(true);
      const detail = await getSegmentDetail(segmentId);
      if (detail) {
        setName(detail.segment.name);
        setDescription(detail.segment.description || "");
        setSegmentType(detail.segment.segment_type);
        setConditionLogic(detail.segment.condition_logic || "AND");
        setConditions(detail.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })));
        if (detail.segment.segment_type === "Manual") {
          const page = await getSegmentMembersPage(segmentId, 1);
          setMembers(page.rows);
        }
      }
      setIsLoading(false);
    })();
  }, [segmentId]);

  useEffect(() => {
    if (segmentType !== "Manual" || !memberSearch) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await getCustomers(memberSearch);
      setCustomerResults(results.slice(0, 8));
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, segmentType]);

  function applyTemplate(key: string) {
    const template = SEGMENT_TEMPLATES.find((t) => t.key === key);
    if (!template) return;
    setConditionLogic(template.conditionLogic);
    setConditions(template.conditions);
  }

  function addConditionRow() {
    setConditions((prev) => [...prev, { field: "purchase_count", operator: "greater_than", value: 0 }]);
  }

  async function handleAddMember(customer: Customer) {
    if (!isEditing) {
      // Create mode - held locally, persisted on Save.
      if (members.some((m) => m.customer_id === customer.id)) return;
      setMembers((prev) => [...prev, { segment_id: "", customer_id: customer.id!, customer: { id: customer.id!, full_name: customer.full_name, customer_code: customer.customer_code, phone: customer.phone } }]);
      setMemberSearch("");
      return;
    }
    const staff = await getCurrentStaff();
    await addCustomersToManualSegment(segmentId!, [customer.id!], staff?.id ?? null);
    const page = await getSegmentMembersPage(segmentId!, 1);
    setMembers(page.rows);
    setMemberSearch("");
  }

  async function handleRemoveMember(customerId: string) {
    if (!isEditing) {
      setMembers((prev) => prev.filter((m) => m.customer_id !== customerId));
      return;
    }
    await removeCustomerFromManualSegment(segmentId!, customerId);
    const page = await getSegmentMembersPage(segmentId!, 1);
    setMembers(page.rows);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    const staff = await getCurrentStaff();

    if (isEditing) {
      if (segmentType === "Dynamic") {
        await updateDynamicSegment(segmentId!, { name, description, conditionLogic, conditions });
      } else {
        await updateManualSegmentInfo(segmentId!, { name, description });
      }
      setIsSaving(false);
      router.push(`/marketing/segments/${segmentId}`);
      return;
    }

    if (segmentType === "Dynamic") {
      const created = await createDynamicSegment({
        name,
        description,
        conditionLogic,
        conditions,
        createdBy: staff?.id ?? null,
      });
      setIsSaving(false);
      if (created?.id) router.push(`/marketing/segments/${created.id}`);
      return;
    }

    const created = await createManualSegment({
      name,
      description,
      customerIds: members.map((m) => m.customer_id),
      createdBy: staff?.id ?? null,
    });
    setIsSaving(false);
    if (created?.id) router.push(`/marketing/segments/${created.id}`);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
      <div className="space-y-6">
        <Card className="space-y-4">
          <Input label="Tên phân khúc" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Khách hàng VIP" />
          <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả (tùy chọn)" />

          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Loại phân khúc</label>
              <div className="flex gap-2">
                {SEGMENT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSegmentType(opt.value as SegmentType)}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                      segmentType === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {segmentType === "Dynamic" ? (
          <Card className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-semibold text-foreground">Điều kiện</h3>
              {!isEditing && (
                <Select
                  options={SEGMENT_TEMPLATES.map((t) => ({ value: t.key, label: t.label }))}
                  placeholder="Dùng mẫu có sẵn..."
                  onChange={(e) => e.target.value && applyTemplate(e.target.value)}
                  className="w-56"
                />
              )}
            </div>

            <Select options={CONDITION_LOGIC_OPTIONS} value={conditionLogic} onChange={(e) => setConditionLogic(e.target.value as ConditionLogic)} />

            <div className="space-y-3">
              {conditions.map((condition, index) => (
                <SegmentConditionRow
                  key={index}
                  condition={condition}
                  staffOptions={staffOptions}
                  onChange={(next) => setConditions((prev) => prev.map((c, i) => (i === index ? next : c)))}
                  onRemove={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
                />
              ))}
            </div>

            <Button variant="secondary" size="sm" onClick={addConditionRow}>
              <Plus className="w-4 h-4" />
              Thêm điều kiện
            </Button>
          </Card>
        ) : (
          <Card className="space-y-4">
            <h3 className="font-semibold text-foreground">Khách hàng trong phân khúc</h3>
            <div className="relative">
              <SearchInput
                placeholder="Tìm khách hàng theo tên, mã, SĐT..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                onClear={() => setMemberSearch("")}
              />
              {customerResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleAddMember(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
                    >
                      <span>
                        {c.full_name} <span className="text-muted-foreground">· {c.customer_code}</span>
                      </span>
                      <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có khách hàng nào trong phân khúc này</p>
              ) : (
                members.map((m) => (
                  <div key={m.customer_id} className="flex items-center justify-between text-sm px-3 py-2 rounded-md hover:bg-muted/50">
                    <span>
                      {m.customer?.full_name} <span className="text-muted-foreground">· {m.customer?.customer_code}</span>
                    </span>
                    <button onClick={() => handleRemoveMember(m.customer_id)} className="text-muted-foreground hover:text-destructive text-xs">
                      Xóa
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        <div className="flex gap-3">
          <Button onClick={handleSave} isLoading={isSaving} disabled={!name.trim()}>
            Lưu
          </Button>
          <Button variant="secondary" onClick={() => router.back()}>
            Hủy
          </Button>
        </div>
      </div>

      {segmentType === "Dynamic" && <SegmentLivePreview conditions={conditions} logic={conditionLogic} />}
    </div>
  );
}
