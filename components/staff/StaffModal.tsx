"use client";

import { Staff } from "@/types/staff";
import StaffForm from "./StaffForm";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  title: string;
  staff: Partial<Staff>;
  setStaff: React.Dispatch<React.SetStateAction<Partial<Staff>>>;
  errors?: Record<string, string>;
  onSave: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function StaffModal({
  open,
  title,
  staff,
  setStaff,
  errors,
  onSave,
  onClose,
  isLoading = false,
}: Props) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="max-h-96 overflow-y-auto mb-6">
        <StaffForm staff={staff} setStaff={setStaff} errors={errors} />
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          Hủy
        </Button>
        <Button variant="primary" onClick={onSave} isLoading={isLoading}>
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
