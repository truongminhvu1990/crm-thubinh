"use client";

import { Partner } from "@/types/partner";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { PARTNER_TYPE_OPTIONS, PARTNER_STATUS_OPTIONS } from "@/lib/partner/partner.constants";

interface Props {
  partner: Partial<Partner>;
  setPartner: React.Dispatch<React.SetStateAction<Partial<Partner>>>;
  errors?: Record<string, string>;
}

/** Create/Edit Partner — Required fields per the Product Owner Implementation
 * Task: Partner Name, Partner Type, Phone, Email, Address, Notes, Status.
 * Partner Code is system-generated (see lib/partner/partner.service.ts
 * generatePartnerCode) and never shown on this form. */
export default function PartnerForm({ partner, setPartner, errors = {} }: Props) {
  function updateField<K extends keyof Partner>(field: K, value: Partner[K]) {
    setPartner({ ...partner, [field]: value });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          data-testid="partner-name-input"
          label="Tên đối tác *"
          placeholder="Nhập tên đối tác"
          value={partner.name || ""}
          onChange={(e) => updateField("name", e.target.value)}
          error={errors.name}
        />

        <Select
          data-testid="partner-type-select"
          label="Loại đối tác *"
          options={PARTNER_TYPE_OPTIONS}
          placeholder="Chọn loại đối tác"
          value={partner.partner_type || ""}
          onChange={(e) => updateField("partner_type", e.target.value)}
        />

        <Input
          data-testid="partner-phone-input"
          label="Điện thoại"
          placeholder="Nhập số điện thoại"
          value={partner.phone || ""}
          onChange={(e) => updateField("phone", e.target.value)}
          error={errors.phone}
        />

        <Input
          data-testid="partner-email-input"
          type="email"
          label="Email"
          placeholder="Nhập email"
          value={partner.email || ""}
          onChange={(e) => updateField("email", e.target.value)}
          error={errors.email}
        />

        <Select
          data-testid="partner-status-select"
          label="Trạng thái *"
          options={PARTNER_STATUS_OPTIONS}
          value={partner.status || "Onboarding"}
          onChange={(e) => updateField("status", e.target.value as Partner["status"])}
        />

        <Input
          data-testid="partner-address-input"
          label="Địa chỉ"
          placeholder="Nhập địa chỉ"
          value={partner.address || ""}
          onChange={(e) => updateField("address", e.target.value)}
        />
      </div>

      <div className="w-full">
        <label className="block text-sm font-medium text-foreground mb-1.5">Ghi chú</label>
        <textarea
          data-testid="partner-notes-input"
          placeholder="Ghi chú nội bộ về đối tác"
          value={partner.notes || ""}
          onChange={(e) => updateField("notes", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}
