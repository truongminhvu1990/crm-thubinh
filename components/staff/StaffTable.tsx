"use client";

import { useState } from "react";
import Link from "next/link";
import { Staff } from "@/types/staff";
import { Edit2, Trash2, Phone, Users } from "lucide-react";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";
import Avatar from "@/components/ui/Avatar";
import { formatDate } from "@/lib/utils";
import {
  STAFF_ROLE_OPTIONS,
  STAFF_STATUS_OPTIONS,
  STAFF_ROLE_BADGE_VARIANT,
  STAFF_STATUS_BADGE_VARIANT,
} from "@/lib/staff.constants";
import { labelFor } from "@/lib/customer.constants";

interface Props {
  staffList: Staff[];
  onEdit: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
  isLoading?: boolean;
}

export default function StaffTable({ staffList, onEdit, onDelete, isLoading = false }: Props) {
  const [pendingDelete, setPendingDelete] = useState<Staff | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (staffList.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Users className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có nhân viên nào</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Nhân viên
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Số điện thoại
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Vai trò
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trạng thái
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ngày vào làm
            </th>
            <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Thao tác
            </th>
          </tr>
        </thead>
        <tbody>
          {staffList.map((staff) => (
            <tr
              key={staff.id}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
            >
              <td className="px-5 py-3.5">
                <Link href={`/settings/staff/${staff.id}`} className="flex items-center gap-3">
                  <Avatar name={staff.full_name} size="sm" />
                  <div className="min-w-0">
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {staff.full_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{staff.staff_code}</div>
                  </div>
                </Link>
              </td>
              <td className="px-5 py-3.5 text-sm">
                {staff.phone ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    {staff.phone}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-5 py-3.5 text-sm">
                <Badge variant={STAFF_ROLE_BADGE_VARIANT[staff.role]}>
                  {labelFor(STAFF_ROLE_OPTIONS, staff.role) || staff.role}
                </Badge>
              </td>
              <td className="px-5 py-3.5 text-sm">
                <Badge variant={STAFF_STATUS_BADGE_VARIANT[staff.status]}>
                  {labelFor(STAFF_STATUS_OPTIONS, staff.status) || staff.status}
                </Badge>
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">
                {staff.joined_date ? formatDate(staff.joined_date) : "—"}
              </td>
              <td className="px-5 py-3.5">
                <div className="flex gap-1 justify-end opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(staff)}
                    className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Edit2 className="w-4 h-4 text-primary" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(staff)}
                    className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AlertDialog
        open={!!pendingDelete}
        title="Xóa nhân viên?"
        description={
          pendingDelete
            ? `Bạn có chắc muốn xóa "${pendingDelete.full_name}"? Hành động này không thể hoàn tác.`
            : undefined
        }
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
