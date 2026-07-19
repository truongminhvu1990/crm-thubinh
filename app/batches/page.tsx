"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { ProductBatch } from "@/types/productBatch";
import {
  getBatches,
  addBatch,
  updateBatch,
  deleteBatch,
  getNextBatchCode,
} from "@/lib/productBatch.service";
import BatchTable from "@/components/batch/BatchTable";
import BatchModal from "@/components/batch/BatchModal";
import Button from "@/components/ui/Button";

const EMPTY_BATCH: Partial<ProductBatch> = {
  batch_code: "",
  status: "active",
};

export default function BatchesPage() {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<Partial<ProductBatch>>(EMPTY_BATCH);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  async function loadBatches() {
    setIsLoading(true);
    const data = await getBatches();
    setBatches(data);
    setIsLoading(false);
  }

  useEffect(() => {
    loadBatches();
  }, []);

  async function handleAddBatch() {
    const nextCode = await getNextBatchCode();
    setCurrentBatch({ ...EMPTY_BATCH, batch_code: nextCode });
    setErrors({});
    setIsEditing(false);
    setModalOpen(true);
  }

  function handleEditBatch(batch: ProductBatch) {
    setCurrentBatch(batch);
    setErrors({});
    setIsEditing(true);
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setCurrentBatch(EMPTY_BATCH);
    setIsEditing(false);
    setErrors({});
  }

  async function handleSaveBatch() {
    if (!currentBatch.batch_code?.trim()) {
      setErrors({ batch_code: "Vui lòng nhập mã lô hàng" });
      return;
    }

    setIsSaving(true);
    try {
      const result =
        isEditing && currentBatch.id
          ? await updateBatch(currentBatch.id, currentBatch)
          : await addBatch(currentBatch);

      if (result.error) {
        const isDuplicate = (result.error as { code?: string }).code === "23505";
        setErrors({
          batch_code: isDuplicate ? "Mã lô hàng đã tồn tại" : "Lỗi khi lưu, vui lòng thử lại",
        });
        return;
      }

      handleCloseModal();
      await loadBatches();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBatch(batch: ProductBatch) {
    setIsLoading(true);
    try {
      const error = await deleteBatch(batch.id!);
      if (error) {
        alert("Lỗi khi xóa lô hàng, vui lòng thử lại");
        return;
      }
      await loadBatches();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="pb-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Lô hàng
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {batches.length} lô hàng · Theo dõi hàng ký gửi (ODNHVN) và hạn trả nhà cung cấp.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" size="md" onClick={loadBatches}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
          <Button variant="primary" size="md" onClick={handleAddBatch} className="whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Thêm lô hàng
          </Button>
        </div>
      </div>

      <BatchTable
        batches={batches}
        onEdit={handleEditBatch}
        onDelete={handleDeleteBatch}
        isLoading={isLoading}
      />

      <BatchModal
        open={modalOpen}
        title={isEditing ? "Chỉnh sửa lô hàng" : "Thêm lô hàng mới"}
        batch={currentBatch}
        setBatch={setCurrentBatch}
        errors={errors}
        onSave={handleSaveBatch}
        onClose={handleCloseModal}
        isLoading={isSaving}
      />
    </div>
  );
}
