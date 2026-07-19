"use client";

import { Product } from "@/types/product";
import { CustomerPurchase } from "@/types/purchase";
import PurchaseForm from "./PurchaseForm";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  title: string;
  purchase: Partial<CustomerPurchase>;
  setPurchase: React.Dispatch<React.SetStateAction<Partial<CustomerPurchase>>>;
  products: Product[];
  onSave: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function PurchaseModal({
  open,
  title,
  purchase,
  setPurchase,
  products,
  onSave,
  onClose,
  isLoading = false,
}: Props) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="mb-6">
        <PurchaseForm purchase={purchase} setPurchase={setPurchase} products={products} />
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
