"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Edit2, Phone, Mail, CalendarDays, Users, Wallet, Percent, History } from "lucide-react";
import { Staff } from "@/types/staff";
import { Customer } from "@/types/customer";
import { ActivityLog } from "@/types/activityLog";
import {
  getStaffById,
  updateStaff,
  getCustomersByAssignedStaff,
  getStaffRevenue,
  getStaffCommissionSummary,
  StaffRevenueSummary,
  StaffCommissionSummary,
} from "@/lib/staff.service";
import { getActivityLogsByStaff } from "@/lib/activityLog.service";
import { getRoleById } from "@/lib/permission/permissionCenter.service";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import { formatDate } from "@/lib/utils";
import { labelFor } from "@/lib/customer.constants";
import { STAFF_ROLE_OPTIONS, STAFF_STATUS_OPTIONS, STAFF_ROLE_BADGE_VARIANT, STAFF_STATUS_BADGE_VARIANT } from "@/lib/staff.constants";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/ui/StatCard";
import Avatar from "@/components/ui/Avatar";
import InfoItem from "@/components/ui/InfoItem";
import StaffModal from "@/components/staff/StaffModal";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const ACTION_LABEL: Record<string, string> = {
  created: "Đã tạo",
  updated: "Đã cập nhật",
};

export default function StaffDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [staff, setStaff] = useState<Staff | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [revenue, setRevenue] = useState<StaffRevenueSummary>({ count: 0, totalRevenue: 0 });
  const [commission, setCommission] = useState<StaffCommissionSummary>({
    totalCommission: 0,
    pending: 0,
    approved: 0,
    paid: 0,
  });
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<Partial<Staff>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [newRoleName, setNewRoleName] = useState<string | null>(null);

  async function loadAll() {
    if (!id) return;
    setIsLoading(true);
    try {
      const staffData = await getStaffById(id);
      setStaff(staffData);
      if (!staffData) return;

      const [customersData, revenueData, commissionData, activitiesData] = await Promise.all([
        getCustomersByAssignedStaff(id),
        getStaffRevenue(staffData),
        getStaffCommissionSummary(staffData),
        getActivityLogsByStaff(id),
      ]);
      setCustomers(customersData);
      setRevenue(revenueData);
      setCommission(commissionData);
      setActivities(activitiesData);

      // User Role Assignment (Decision 10) - resolves the dynamic role's
      // display name for the badge above, when this staff member has
      // already been migrated (role_id set).
      if (staffData.role_id) {
        const role = await getRoleById(staffData.role_id);
        setNewRoleName(role?.name || null);
      } else {
        setNewRoleName(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveStaff() {
    if (!staff?.id) return;
    setIsSaving(true);
    try {
      const { data, error } = await updateStaff(staff.id, editStaff);
      if (error) {
        // Production Authentication Hotfix V2 - updateStaff() now validates
        // email required/unique server-side (this page never had its own
        // pre-check); surface those two cases distinctly rather than the
        // generic message below.
        const errorCode = (error as { code?: string }).code;
        if (errorCode === "EMAIL_REQUIRED") {
          alert("Vui lòng nhập email");
        } else if (errorCode === "EMAIL_DUPLICATE") {
          alert("Email đã tồn tại");
        } else {
          throw error;
        }
        return;
      }
      if (data) {
        let finalStaff = data;
        // User Role Assignment (Decision 10, PERMISSION_UI.md §8) - written
        // separately through the protected endpoint, same as
        // app/settings/staff/page.tsx; updateStaff() never touches these
        // two fields (not in its WRITABLE_FIELDS whitelist).
        try {
          finalStaff = await permissionApi.assignStaffPermission(staff.id, {
            role_id: editStaff.role_id ?? null,
            team_id: editStaff.team_id ?? null,
          });
        } catch (e) {
          console.error("Error assigning role/team:", e);
        }
        setStaff(finalStaff);
        setNewRoleName(finalStaff.role_id ? (await getRoleById(finalStaff.role_id))?.name || null : null);
        setModalOpen(false);
      }
    } catch (error) {
      alert("Lỗi khi lưu thông tin nhân viên");
      console.error(error);
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

  if (!staff) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy nhân viên</p>
        <Button onClick={() => router.back()} className="mt-4">
          Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <Link
        href="/settings/staff"
        className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-5 h-5" />
        Quay lại
      </Link>

      <div className="space-y-6">
        {/* Profile */}
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div className="flex items-center gap-5">
              <Avatar name={staff.full_name} size="lg" />
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-[28px] font-bold text-foreground tracking-tight">
                    {staff.full_name}
                  </h1>
                  <Badge variant={STAFF_ROLE_BADGE_VARIANT[staff.role]} className="text-sm px-2.5 py-0.5">
                    {labelFor(STAFF_ROLE_OPTIONS, staff.role) || staff.role}
                  </Badge>
                  <Badge variant={STAFF_STATUS_BADGE_VARIANT[staff.status]} className="text-sm px-2.5 py-0.5">
                    {labelFor(STAFF_STATUS_OPTIONS, staff.status) || staff.status}
                  </Badge>
                  {newRoleName ? (
                    <Badge variant="secondary" className="text-sm px-2.5 py-0.5">
                      {newRoleName}
                    </Badge>
                  ) : (
                    <Badge variant="muted" className="text-sm px-2.5 py-0.5">
                      Chưa di chuyển vai trò
                    </Badge>
                  )}
                  <Badge variant={staff.team_id ? "default" : "muted"} className="text-sm px-2.5 py-0.5">
                    {staff.team_id || "Chưa có nhóm"}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm mt-1.5">Mã nhân viên: {staff.staff_code}</p>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setEditStaff(staff);
                setModalOpen(true);
              }}
            >
              <Edit2 className="w-4 h-4" />
              Chỉnh sửa
            </Button>
          </div>

          <div className="mt-7 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-6">
            {staff.phone && (
              <InfoItem icon={<Phone className="w-4 h-4" />} label="Số điện thoại">
                <a href={`tel:${staff.phone}`} className="hover:text-primary hover:underline">
                  {staff.phone}
                </a>
              </InfoItem>
            )}
            {staff.email && (
              <InfoItem icon={<Mail className="w-4 h-4" />} label="Email">
                {staff.email}
              </InfoItem>
            )}
            {staff.joined_date && (
              <InfoItem icon={<CalendarDays className="w-4 h-4" />} label="Ngày vào làm">
                {formatDate(staff.joined_date)}
              </InfoItem>
            )}
          </div>

          {staff.note && <p className="text-sm text-foreground mt-4 pt-4 border-t border-border">{staff.note}</p>}
        </Card>

        {/* Sales Revenue + Commission */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Khách hàng phụ trách"
            value={customers.length}
            icon={<Users className="w-5 h-5 text-primary" />}
          />
          <StatCard
            title="Doanh thu"
            value={currency.format(revenue.totalRevenue)}
            icon={<Wallet className="w-5 h-5 text-emerald-600" />}
            color="bg-emerald-100"
          />
          <StatCard
            title="Tổng hoa hồng"
            value={currency.format(commission.totalCommission)}
            icon={<Percent className="w-5 h-5 text-amber-600" />}
            color="bg-amber-100"
          />
          <StatCard
            title="Hoa hồng chờ duyệt"
            value={currency.format(commission.pending)}
            icon={<Percent className="w-5 h-5 text-muted-foreground" />}
            color="bg-muted text-muted-foreground"
          />
        </div>

        {/* Assigned Customers */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Khách hàng phụ trách</h2>
          {customers.length === 0 ? (
            <Card>
              <p className="text-muted-foreground text-sm text-center py-6">Chưa có khách hàng nào được phân công</p>
            </Card>
          ) : (
            <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Khách hàng
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Số điện thoại
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-3">
                        <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                          <Avatar name={c.full_name} size="sm" />
                          <div>
                            <div className="font-medium text-foreground">{c.full_name}</div>
                            <div className="text-xs text-muted-foreground">{c.customer_code}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{c.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activities */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Hoạt động gần đây</h2>
          <Card>
            {activities.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">Chưa có hoạt động nào</p>
            ) : (
              <ul className="divide-y divide-border">
                {activities.map((a) => (
                  <li key={a.id} className="py-3 flex items-start gap-3">
                    <History className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        {ACTION_LABEL[a.action] || a.action} {a.entity}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <StaffModal
        open={modalOpen}
        title="Chỉnh sửa nhân viên"
        staff={editStaff}
        setStaff={setEditStaff}
        onSave={handleSaveStaff}
        onClose={() => setModalOpen(false)}
        isLoading={isSaving}
      />
    </div>
  );
}
