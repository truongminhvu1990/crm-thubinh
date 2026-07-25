"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { Staff } from "@/types/staff";
import { getStaffList, updateStaff, archiveStaff, getNextStaffCode, getStaffByEmail } from "@/lib/staff.service";
import { createStaffWithAuthApi } from "@/lib/auth/staffAuthApi";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import StaffTable from "@/components/staff/StaffTable";
import StaffModal from "@/components/staff/StaffModal";
import TemporaryPasswordDialog from "@/components/staff/TemporaryPasswordDialog";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";

const EMPTY_STAFF: Partial<Staff> = {
  full_name: "",
  role: "Sales",
  status: "Active",
};

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Partial<Staff>>(EMPTY_STAFF);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [newAuthAccount, setNewAuthAccount] = useState<{ staff: Staff; temporaryPassword: string } | null>(null);

  async function loadStaff() {
    setIsLoading(true);
    const data = await getStaffList(searchTerm);
    setStaffList(data);
    setIsLoading(false);
  }

  useEffect(() => {
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  async function handleAddStaff() {
    const nextCode = await getNextStaffCode();
    setCurrentStaff({ ...EMPTY_STAFF, staff_code: nextCode });
    setErrors({});
    setIsEditing(false);
    setModalOpen(true);
  }

  function handleEditStaff(staff: Staff) {
    setCurrentStaff(staff);
    setErrors({});
    setIsEditing(true);
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setCurrentStaff(EMPTY_STAFF);
    setIsEditing(false);
    setErrors({});
  }

  async function handleSaveStaff() {
    if (!currentStaff.staff_code?.trim()) {
      setErrors({ staff_code: "Vui lòng nhập mã nhân viên" });
      return;
    }
    if (!currentStaff.full_name?.trim()) {
      setErrors({ full_name: "Vui lòng nhập họ tên" });
      return;
    }
    // Production Authentication Hotfix V2, Package 3 - email is now
    // required and must be unique. This is a UX pre-check only, not the
    // enforcement boundary - updateStaff() (lib/staff.service.ts) and
    // createStaffWithAuth() (lib/auth/createStaffWithAuth.ts) validate the
    // same rules server-side, and staff_email_unique
    // (20260730_staff_email_unique_index.sql) enforces uniqueness at the
    // DB layer, so bypassing this check (or a race with another save)
    // still can't produce a duplicate.
    if (!currentStaff.email?.trim()) {
      setErrors({ email: "Vui lòng nhập email" });
      return;
    }
    const existingByEmail = await getStaffByEmail(currentStaff.email.trim());
    if (existingByEmail && existingByEmail.id !== currentStaff.id) {
      setErrors({ email: "Email đã tồn tại" });
      return;
    }

    setIsSaving(true);
    try {
      let savedId: string | undefined;

      if (isEditing && currentStaff.id) {
        const result = await updateStaff(currentStaff.id, currentStaff);
        if (result.error) {
          const errorCode = (result.error as { code?: string }).code;
          if (errorCode === "EMAIL_REQUIRED") {
            setErrors({ email: "Vui lòng nhập email" });
          } else if (errorCode === "EMAIL_DUPLICATE") {
            setErrors({ email: "Email đã tồn tại" });
          } else if (errorCode === "23505") {
            setErrors({ staff_code: "Mã nhân viên đã tồn tại" });
          } else {
            setErrors({ staff_code: "Lỗi khi lưu, vui lòng thử lại" });
          }
          return;
        }
        savedId = result.data?.id;
      } else {
        // Staff Identity & Authentication Foundation, Business Rule 2/3 -
        // creating a staff member now always goes through POST /api/staff,
        // which creates the Supabase Auth account first and only then the
        // Staff row (with rollback if the Staff row fails). Never call
        // addStaff() directly for new staff - that path never creates an
        // Auth account, so a staff row it produces could never sign in.
        const result = await createStaffWithAuthApi({
          staff_code: currentStaff.staff_code!.trim(),
          full_name: currentStaff.full_name!.trim(),
          phone: currentStaff.phone?.trim() || null,
          email: currentStaff.email!.trim(),
          role: currentStaff.role || "Sales",
          joined_date: currentStaff.joined_date || null,
          avatar: currentStaff.avatar || null,
          note: currentStaff.note?.trim() || null,
        });
        if (result.error) {
          switch (result.error.code) {
            case "EMAIL_REQUIRED":
              setErrors({ email: "Vui lòng nhập email" });
              break;
            case "EMAIL_DUPLICATE":
              setErrors({ email: "Email đã tồn tại" });
              break;
            case "STAFF_CODE_DUPLICATE":
              setErrors({ staff_code: "Mã nhân viên đã tồn tại" });
              break;
            case "CONFIG_MISSING":
              setErrors({ staff_code: "Hệ thống chưa được cấu hình để tạo tài khoản đăng nhập, vui lòng liên hệ quản trị viên" });
              break;
            default:
              setErrors({ staff_code: "Lỗi khi lưu, vui lòng thử lại" });
          }
          return;
        }
        savedId = result.data?.staff.id;
        if (result.data) {
          setNewAuthAccount({ staff: result.data.staff, temporaryPassword: result.data.temporaryPassword });
        }
      }

      // User Role Assignment (Decision 10, PERMISSION_UI.md §8) - role_id/
      // team_id are not in updateStaff()/createStaffWithAuth's writable
      // field set, so they're written separately through the protected,
      // server-side-enforced endpoint. Best-effort: a failure here doesn't
      // block the primary Staff save, which already succeeded above.
      if (savedId) {
        try {
          await permissionApi.assignStaffPermission(savedId, {
            role_id: currentStaff.role_id ?? null,
            team_id: currentStaff.team_id ?? null,
          });
        } catch (e) {
          console.error("Error assigning role/team:", e);
        }
      }

      handleCloseModal();
      await loadStaff();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchiveStaff(staff: Staff) {
    setIsLoading(true);
    try {
      const error = await archiveStaff(staff.id);
      if (error) {
        alert("Lỗi khi lưu trữ nhân viên, vui lòng thử lại");
        return;
      }
      await loadStaff();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="pb-8">
      <Link
        href="/settings"
        className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-5 h-5" />
        Quay lại Cài đặt
      </Link>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Nhân viên</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{staffList.length} nhân viên</p>
        </div>

        <div className="flex gap-3">
          <Button data-testid="staff-reload-button" variant="secondary" size="md" onClick={loadStaff}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
          <Button data-testid="staff-add-button" variant="primary" size="md" onClick={handleAddStaff} className="whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Thêm nhân viên
          </Button>
        </div>
      </div>

      <div className="mb-4 max-w-sm">
        <SearchInput
          data-testid="staff-search-input"
          placeholder="Tìm theo tên, mã, số điện thoại..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <StaffTable staffList={staffList} onEdit={handleEditStaff} onArchive={handleArchiveStaff} isLoading={isLoading} />

      <StaffModal
        open={modalOpen}
        title={isEditing ? "Chỉnh sửa nhân viên" : "Thêm nhân viên mới"}
        staff={currentStaff}
        setStaff={setCurrentStaff}
        errors={errors}
        onSave={handleSaveStaff}
        onClose={handleCloseModal}
        isLoading={isSaving}
      />

      <TemporaryPasswordDialog
        staff={newAuthAccount?.staff ?? null}
        temporaryPassword={newAuthAccount?.temporaryPassword ?? null}
        onClose={() => setNewAuthAccount(null)}
      />
    </div>
  );
}
