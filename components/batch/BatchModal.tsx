"use client";

import { ProductBatch } from "@/types/productBatch";
import BatchForm from "./BatchForm";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  title: string;
  batch: Partial<ProductBatch>;
  setBatch: React.Dispatch<React.SetStateAction<Partial<ProductBatch>>>;
  errors?: Record<string, string>;
  onSave: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function BatchModal({
  open,
  title,
  batch,
  setBatch,
  errors,
  onSave,
  onClose,
  isLoading = false,
}: Props) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="max-h-96 overflow-y-auto mb-6">
        <BatchForm batch={batch} setBatch={setBatch} errors={errors} />
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
