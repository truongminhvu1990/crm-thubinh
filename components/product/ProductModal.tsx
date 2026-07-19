"use client";

import { Product } from "@/types/product";
import ProductForm from "./ProductForm";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  title: string;
  product: Partial<Product>;
  setProduct: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  errors?: Record<string, string>;
  formError?: string;
  onSave: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function ProductModal({
  open,
  title,
  product,
  setProduct,
  errors,
  formError,
  onSave,
  onClose,
  isLoading = false,
}: Props) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="max-h-96 overflow-y-auto mb-6">
        <ProductForm product={product} setProduct={setProduct} errors={errors} />
      </div>

      {formError && <p className="text-destructive text-xs mb-4">{formError}</p>}

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
