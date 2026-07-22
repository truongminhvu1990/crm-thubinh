"use client";

import { useEffect, useState } from "react";
import { Staff } from "@/types/staff";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Hash, User, Phone, Mail, CalendarDays } from "lucide-react";
import { STAFF_ROLE_OPTIONS, STAFF_STATUS_OPTIONS } from "@/lib/staff.constants";
import { getRoles, getTeams } from "@/lib/permission/permissionCenter.service";

interface Props {
  staff: Partial<Staff>;
  setStaff: React.Dispatch<React.SetStateAction<Partial<Staff>>>;
  errors?: Record<string, string>;
}

/** User Role Assignment (Decision 10/13, PERMISSION_UI.md §8) - two
 * additional fields alongside the existing Staff fields. Written through
 * the caller's own save handler via the protected
 * /api/staff/[id]/permission-assignment endpoint, never through the
 * existing updateStaff()/addStaff() path (those stay untouched for
 * backward compatibility - see app/settings/staff/page.tsx). */
export default function StaffForm({ staff, setStaff, errors = {} }: Props) {
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([]);
  const [teamOptions, setTeamOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    getRoles().then((roles) =>
      setRoleOptions(roles.filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name })))
    );
    getTeams().then((teams) => setTeamOptions(teams.map((t) => ({ value: t.team_id, label: t.team_id }))));
  }, []);

  const updateField = (field: keyof Staff, value: string) => {
    setStaff({ ...staff, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã nhân viên *"
          placeholder="VD: NV1"
          value={staff.staff_code || ""}
          onChange={(e) => updateField("staff_code", e.target.value)}
          error={errors.staff_code}
          icon={<Hash className="w-4 h-4" />}
        />
        <Input
          label="Họ tên *"
          placeholder="Tên nhân viên"
          value={staff.full_name || ""}
          onChange={(e) => updateField("full_name", e.target.value)}
          error={errors.full_name}
          icon={<User className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Số điện thoại"
          placeholder="Số điện thoại"
          value={staff.phone || ""}
          onChange={(e) => updateField("phone", e.target.value)}
          icon={<Phone className="w-4 h-4" />}
        />
        <Input
          label="Email *"
          type="email"
          placeholder="email@example.com"
          value={staff.email || ""}
          onChange={(e) => updateField("email", e.target.value)}
          error={errors.email}
          icon={<Mail className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Vai trò"
          placeholder="Chọn vai trò"
          options={STAFF_ROLE_OPTIONS}
          value={staff.role || ""}
          onChange={(e) => updateField("role", e.target.value)}
        />
        <Select
          label="Trạng thái"
          placeholder="Chọn trạng thái"
          options={STAFF_STATUS_OPTIONS}
          value={staff.status || ""}
          onChange={(e) => updateField("status", e.target.value)}
        />
      </div>

      <Input
        label="Ngày vào làm"
        type="date"
        value={staff.joined_date || ""}
        onChange={(e) => updateField("joined_date", e.target.value)}
        icon={<CalendarDays className="w-4 h-4" />}
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Select
            label="Vai trò (mới)"
            placeholder="Chưa gán"
            options={roleOptions}
            value={staff.role_id || ""}
            onChange={(e) => updateField("role_id", e.target.value)}
          />
          {!staff.role_id && (
            <p className="text-xs text-muted-foreground mt-1">Vai trò cũ: {staff.role || "—"} (chưa di chuyển)</p>
          )}
        </div>
        <Select
          label="Nhóm"
          placeholder="Chưa có nhóm"
          options={teamOptions}
          value={staff.team_id || ""}
          onChange={(e) => updateField("team_id", e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Ghi chú</label>
        <textarea
          placeholder="Ghi chú về nhân viên..."
          value={staff.note || ""}
          onChange={(e) => updateField("note", e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}
