"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { Staff } from "@/types/staff";
import { getStaffList, addStaff, updateStaff, deleteStaff, getNextStaffCode } from "@/lib/staff.service";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import StaffTable from "@/components/staff/StaffTable";
import StaffModal from "@/components/staff/StaffModal";
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

    setIsSaving(true);
    try {
      const result =
        isEditing && currentStaff.id
          ? await updateStaff(currentStaff.id, currentStaff)
          : await addStaff(currentStaff);

      if (result.error) {
        const isDuplicate = (result.error as { code?: string }).code === "23505";
        setErrors({
          staff_code: isDuplicate ? "Mã nhân viên đã tồn tại" : "Lỗi khi lưu, vui lòng thử lại",
        });
        return;
      }

      // User Role Assignment (Decision 10, PERMISSION_UI.md §8) - role_id/
      // team_id are not in updateStaff()/addStaff()'s WRITABLE_FIELDS
      // whitelist, so they're written separately through the protected,
      // server-side-enforced endpoint. Best-effort: a failure here doesn't
      // block the primary Staff save, which already succeeded above.
      const savedId = result.data?.id;
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

  async function handleDeleteStaff(staff: Staff) {
    setIsLoading(true);
    try {
      const error = await deleteStaff(staff.id);
      if (error) {
        alert("Lỗi khi xóa nhân viên, vui lòng thử lại");
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
          <Button variant="secondary" size="md" onClick={loadStaff}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
          <Button variant="primary" size="md" onClick={handleAddStaff} className="whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Thêm nhân viên
          </Button>
        </div>
      </div>

      <div className="mb-4 max-w-sm">
        <SearchInput
          placeholder="Tìm theo tên, mã, số điện thoại..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <StaffTable staffList={staffList} onEdit={handleEditStaff} onDelete={handleDeleteStaff} isLoading={isLoading} />

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
    </div>
  );
}
