"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { MarketingLoyaltyRule } from "@/types/marketingAutomation";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: { name: string; description: string; pointsValue: number }) => Promise<void>;
  rule?: MarketingLoyaltyRule | null;
}

/** Flat single-page form (no wizard) - a Loyalty Rule is a single flat
 * entity with few fields, unlike Automation's multi-step definition
 * (MARKETING_AUTOMATION_UI.md §3.7/§8 judgment call). */
export default function LoyaltyRuleFormModal({ open, onClose, onSave, rule }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pointsValue, setPointsValue] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(rule?.name || "");
    setDescription(rule?.description || "");
    setPointsValue(rule ? String(rule.points_value) : "");
    setError("");
  }, [open, rule]);

  async function handleSubmit() {
    const points = Number(pointsValue);
    if (!name.trim() || !points || points <= 0) {
      setError("Vui lòng nhập tên và số điểm hợp lệ (> 0).");
      return;
    }
    setIsSaving(true);
    await onSave({ name, description, pointsValue: points });
    setIsSaving(false);
  }

  return (
    <Modal open={open} title={rule ? "Sửa quy tắc" : "Quy tắc mới"} onClose={onClose}>
      <div className="space-y-4">
        <Input label="Tên quy tắc" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Số điểm" type="number" min={1} value={pointsValue} onChange={(e) => setPointsValue(e.target.value)} />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit} isLoading={isSaving}>Lưu</Button>
        </div>
      </div>
    </Modal>
  );
}
