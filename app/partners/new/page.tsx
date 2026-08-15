"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Partner } from "@/types/partner";
import PartnerForm from "@/components/partner/PartnerForm";
import Button from "@/components/ui/Button";

const EMPTY_PARTNER: Partial<Partner> = {
  name: "",
  partner_type: "Collaborator",
  status: "Onboarding",
};

export default function CreatePartnerPage() {
  const router = useRouter();
  const [partner, setPartner] = useState<Partial<Partner>>(EMPTY_PARTNER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!partner.name?.trim()) nextErrors.name = "Vui lòng nhập tên đối tác";
    if (!partner.partner_type) nextErrors.partner_type = "Vui lòng chọn loại đối tác";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    setFormError(null);
    if (!validate()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partner),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể tạo đối tác");
      }
      const created = await res.json();
      router.push(`/partners/${created.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="pb-8 max-w-3xl">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary mb-6 transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-primary/5"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại
      </button>

      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-6">Thêm đối tác mới</h1>

      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <PartnerForm partner={partner} setPartner={setPartner} errors={errors} />

        {formError && <p className="text-destructive text-sm mt-4">{formError}</p>}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="secondary" onClick={() => router.back()} disabled={isSaving}>
            Hủy
          </Button>
          <Button data-testid="partner-save-button" onClick={handleSave} isLoading={isSaving}>
            Lưu đối tác
          </Button>
        </div>
      </div>
    </div>
  );
}
