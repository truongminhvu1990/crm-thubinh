"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { getActiveSegmentsForPicker } from "@/lib/marketing/marketing.service";
import { getAutomationDetail, createAutomation, updateAutomation } from "@/lib/marketing/automation.service";
import { getCurrentStaff } from "@/lib/permission";
import { AUTOMATION_TYPE_OPTIONS, TRIGGER_TYPE_OPTIONS, FREQUENCY_OPTIONS } from "@/lib/marketing/marketing.constants";
import { AutomationType, AutomationTriggerType, AutomationFrequency } from "@/types/marketingAutomation";
import { Option } from "@/lib/customer.constants";

// New, genuinely un-precedented UI pattern in this codebase (no
// stepper/wizard primitive exists anywhere - MARKETING_AUTOMATION_UI.md §3.4/
// §8). Designed narrowly for this one 5-step flow (linear, no branching),
// not as a general-purpose primitive - same disclosed-scope approach the UI
// doc took for it.

interface Props {
  automationId?: string;
}

const STEP_LABELS = ["Mẫu", "Đối tượng", "Lịch chạy", "Xem lại", "Hoàn tất"];

export default function AutomationWizard({ automationId }: Props) {
  const router = useRouter();
  const isEditing = !!automationId;

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [automationType, setAutomationType] = useState<AutomationType>("Birthday Greeting");
  const [targetSegmentId, setTargetSegmentId] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("Manual");
  const [frequency, setFrequency] = useState<AutomationFrequency>("Once");
  const [currentVersion, setCurrentVersion] = useState(1);

  const [segmentOptions, setSegmentOptions] = useState<Option[]>([]);

  useEffect(() => {
    getActiveSegmentsForPicker().then((segments) => setSegmentOptions(segments.map((s) => ({ value: s.id, label: s.name }))));
  }, []);

  useEffect(() => {
    if (!automationId) return;
    (async () => {
      setIsLoading(true);
      const detail = await getAutomationDetail(automationId);
      if (detail) {
        setName(detail.automation.name);
        setDescription(detail.automation.description || "");
        setAutomationType(detail.automation.automation_type);
        setTargetSegmentId(detail.automation.target_segment_id);
        setTriggerType(detail.automation.trigger_type);
        setFrequency(detail.automation.frequency);
        setCurrentVersion(detail.automation.version);
      }
      setIsLoading(false);
    })();
  }, [automationId]);

  function validateStep(current: number): boolean {
    setError("");
    if (current === 1 && !name.trim()) {
      setError("Vui lòng nhập tên automation.");
      return false;
    }
    if (current === 2 && !targetSegmentId) {
      setError("Vui lòng chọn phân khúc mục tiêu.");
      return false;
    }
    if (current === 3 && triggerType === "Daily Schedule" && !frequency) {
      setError("Vui lòng chọn tần suất.");
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, 5));
  }

  function goBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSave() {
    setIsSaving(true);
    setError("");
    const staff = await getCurrentStaff();

    if (isEditing) {
      const updated = await updateAutomation(
        automationId!,
        currentVersion,
        { name, description, automationType, triggerType, frequency, targetSegmentId },
        staff?.id ?? null
      );
      if (!updated) {
        setError("Không thể lưu automation. Vui lòng thử lại.");
        setIsSaving(false);
        return;
      }
      setSavedId(updated.id!);
    } else {
      const created = await createAutomation({
        name,
        description,
        automationType,
        triggerType,
        frequency,
        targetSegmentId,
        createdBy: staff?.id ?? null,
      });
      if (!created) {
        setError("Không thể tạo automation. Vui lòng thử lại.");
        setIsSaving(false);
        return;
      }
      setSavedId(created.id!);
    }
    setIsSaving(false);
    setStep(5);
  }

  if (isLoading) {
    return <Card className="text-center text-muted-foreground py-12">Đang tải...</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                aria-current={active ? "step" : undefined}
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                  done ? "bg-secondary text-secondary-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : n}
              </div>
              <span className={cn("text-sm hidden sm:inline", active ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
              {n < 5 && <span className="w-6 sm:w-10 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      <Card>
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Bước 1: Chọn mẫu automation</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {AUTOMATION_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAutomationType(opt.value)}
                  className={cn(
                    "rounded-lg border p-3 text-sm text-left transition-colors",
                    automationType === opt.value ? "border-primary bg-primary/5 text-foreground" : "border-border hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Input label="Tên automation" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Bước 2: Chọn đối tượng</h2>
            <Select
              label="Phân khúc mục tiêu"
              options={segmentOptions}
              placeholder="Chọn phân khúc"
              value={targetSegmentId}
              onChange={(e) => setTargetSegmentId(e.target.value)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Bước 3: Lịch chạy</h2>
            <Select
              label="Trigger"
              options={TRIGGER_TYPE_OPTIONS}
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
            />
            {triggerType === "Daily Schedule" && (
              <Select
                label="Tần suất"
                options={FREQUENCY_OPTIONS}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as AutomationFrequency)}
              />
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Bước 4: Xem lại</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Tên</dt><dd className="text-foreground font-medium">{name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Mẫu</dt><dd className="text-foreground font-medium">{AUTOMATION_TYPE_OPTIONS.find((o) => o.value === automationType)?.label}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Phân khúc</dt><dd className="text-foreground font-medium">{segmentOptions.find((o) => o.value === targetSegmentId)?.label}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Trigger</dt><dd className="text-foreground font-medium">{TRIGGER_TYPE_OPTIONS.find((o) => o.value === triggerType)?.label}</dd></div>
              {triggerType === "Daily Schedule" && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Tần suất</dt><dd className="text-foreground font-medium">{FREQUENCY_OPTIONS.find((o) => o.value === frequency)?.label}</dd></div>
              )}
            </dl>
            {isEditing && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Lưu sẽ tăng phiên bản lên v{currentVersion + 1}.
              </p>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-secondary/10 text-secondary flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">{isEditing ? "Đã cập nhật automation" : "Đã tạo automation"}</h2>
            <p className="text-muted-foreground text-sm">Automation ở trạng thái Nháp - kích hoạt từ trang chi tiết khi sẵn sàng.</p>
            <Button onClick={() => router.push(`/marketing/automation/${savedId}`)}>Xem chi tiết</Button>
          </div>
        )}

        {error && <p className="text-destructive text-sm mt-4">{error}</p>}

        {step < 5 && (
          <div className="flex justify-between pt-6 mt-6 border-t border-border">
            <Button variant="secondary" onClick={step === 1 ? () => router.push("/marketing/automation") : goBack}>
              {step === 1 ? "Hủy" : "Quay lại"}
            </Button>
            {step < 4 ? (
              <Button onClick={goNext}>Tiếp theo</Button>
            ) : (
              <Button onClick={handleSave} isLoading={isSaving}>Lưu</Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
