"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Partner } from "@/types/partner";
import PartnerForm from "@/components/partner/PartnerForm";
import Button from "@/components/ui/Button";

export default function EditPartnerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [partner, setPartner] = useState<Partial<Partner>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    queueMicrotask(() => {
      setIsLoading(true);
      fetch(`/api/partners/${id}`)
        .then((res) => {
          if (!res.ok) throw new Error("Không tìm thấy đối tác");
          return res.json();
        })
        .then(setPartner)
        .catch((error) => console.error("Failed to load partner:", error))
        .finally(() => setIsLoading(false));
    });
  }, [id]);

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
      const res = await fetch(`/api/partners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partner),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể cập nhật đối tác");
      }
      router.push(`/partners/${id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
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

      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-6">
        Chỉnh sửa đối tác — {partner.partner_code}
      </h1>

      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <PartnerForm partner={partner} setPartner={setPartner} errors={errors} />

        {formError && <p className="text-destructive text-sm mt-4">{formError}</p>}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="secondary" onClick={() => router.back()} disabled={isSaving}>
            Hủy
          </Button>
          <Button data-testid="partner-save-button" onClick={handleSave} isLoading={isSaving}>
            Lưu thay đổi
          </Button>
        </div>
      </div>
    </div>
  );
}
