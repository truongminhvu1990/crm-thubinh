"use client";

import { Customer } from "@/types/customer";
import CustomerForm from "./CustomerForm";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  title: string;
  customer: Partial<Customer>;
  setCustomer: React.Dispatch<React.SetStateAction<Partial<Customer>>>;
  errors?: Record<string, string>;
  formError?: string;
  onSave: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function CustomerModal({
  open,
  title,
  customer,
  setCustomer,
  errors,
  formError,
  onSave,
  onClose,
  isLoading = false,
}: Props) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="max-h-[65vh] overflow-y-auto mb-6 pr-1">
        <CustomerForm customer={customer} setCustomer={setCustomer} errors={errors} />
      </div>

      {formError && <p className="text-destructive text-xs mb-4">{formError}</p>}

      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={isLoading}
        >
          Hủy
        </Button>
        <Button
          variant="primary"
          onClick={onSave}
          isLoading={isLoading}
        >
          Lưu
        </Button>
      </div>
    </Modal>
  );
}