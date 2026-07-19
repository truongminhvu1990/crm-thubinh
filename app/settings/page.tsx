"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Power, ArrowUp, ArrowDown, Settings as SettingsIcon } from "lucide-react";
import { MasterDataCategory, MasterDataItem } from "@/types/masterData";
import {
  getMasterDataItems,
  addMasterDataItem,
  updateMasterDataItem,
  setMasterDataActive,
  deleteMasterDataItem,
  isMasterDataValueInUse,
  moveMasterDataItem,
} from "@/lib/masterData.service";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import AlertDialog from "@/components/ui/AlertDialog";

const GENERAL_CATEGORIES: { key: MasterDataCategory; label: string }[] = [
  { key: "salesperson", label: "Nhân viên bán hàng" },
  { key: "customer_stage", label: "Giai đoạn khách hàng" },
];

const PRODUCT_CATEGORIES: { key: MasterDataCategory; label: string }[] = [
  { key: "product_category", label: "Danh mục sản phẩm" },
  { key: "product_source", label: "Nguồn hàng" },
  { key: "product_color", label: "Màu sắc sản phẩm" },
];

const CUSTOMER_CATEGORIES: { key: MasterDataCategory; label: string }[] = [
  { key: "country", label: "Quốc gia" },
  { key: "market", label: "Thị trường" },
];

const CATEGORIES = [...GENERAL_CATEGORIES, ...PRODUCT_CATEGORIES, ...CUSTOMER_CATEGORIES];

function isDuplicateValue(items: MasterDataItem[], value: string, excludeId?: string) {
  const normalized = value.trim().toLowerCase();
  return items.some(
    (item) => item.id !== excludeId && item.value.trim().toLowerCase() === normalized
  );
}

export default function SettingsPage() {
  const [category, setCategory] = useState<MasterDataCategory>("salesperson");
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);
  const [valueInput, setValueInput] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<MasterDataItem | null>(null);
  const [blockedDeleteValue, setBlockedDeleteValue] = useState<string | null>(null);

  async function loadItems() {
    setIsLoading(true);
    const data = await getMasterDataItems(category);
    setItems(data);
    setIsLoading(false);
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  function openAddModal() {
    setEditingItem(null);
    setValueInput("");
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(item: MasterDataItem) {
    setEditingItem(item);
    setValueInput(item.value);
    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingItem(null);
    setValueInput("");
    setFormError("");
  }

  async function handleSave() {
    const value = valueInput.trim();

    if (!value) {
      setFormError("Vui lòng nhập giá trị");
      return;
    }
    if (/[,\n]/.test(value)) {
      setFormError("Giá trị không được chứa dấu phẩy hoặc xuống dòng");
      return;
    }
    if (isDuplicateValue(items, value, editingItem?.id)) {
      setFormError("Giá trị đã tồn tại");
      return;
    }

    setIsSaving(true);
    try {
      const result = editingItem
        ? await updateMasterDataItem(editingItem.id, value)
        : await addMasterDataItem(category, value);

      if (result.error) {
        setFormError(result.isDuplicate ? "Giá trị đã tồn tại" : "Lỗi khi lưu, vui lòng thử lại");
        return;
      }

      closeModal();
      await loadItems();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(item: MasterDataItem) {
    setIsLoading(true);
    const { error } = await setMasterDataActive(item.id, !item.is_active);
    if (error) {
      alert("Lỗi khi cập nhật trạng thái, vui lòng thử lại");
      setIsLoading(false);
      return;
    }
    await loadItems();
  }

  async function handleDelete(item: MasterDataItem) {
    setIsLoading(true);
    const error = await deleteMasterDataItem(item.id);
    if (error) {
      alert("Lỗi khi xóa, vui lòng thử lại");
      setIsLoading(false);
      return;
    }
    await loadItems();
  }

  async function handleDeleteClick(item: MasterDataItem) {
    const inUse = await isMasterDataValueInUse(category, item.value);
    if (inUse) {
      setBlockedDeleteValue(item.value);
      return;
    }
    setPendingDelete(item);
  }

  async function handleMove(item: MasterDataItem, direction: "up" | "down") {
    setIsLoading(true);
    const error = await moveMasterDataItem(items, item.id, direction);
    if (error) {
      alert("Lỗi khi sắp xếp, vui lòng thử lại");
      setIsLoading(false);
      return;
    }
    await loadItems();
  }

  const activeCategoryLabel = CATEGORIES.find((c) => c.key === category)?.label || "";

  return (
    <div className="pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-primary" />
          Cài đặt
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">Dữ liệu dùng chung (Master Data)</p>
      </div>

      <div className="mb-6 space-y-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chung</p>
          <div className="flex flex-wrap gap-2">
            {GENERAL_CATEGORIES.map((c) => (
              <Button
                key={c.key}
                variant={c.key === category ? "primary" : "secondary"}
                size="sm"
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sản phẩm</p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((c) => (
              <Button
                key={c.key}
                variant={c.key === category ? "primary" : "secondary"}
                size="sm"
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Khách hàng</p>
          <div className="flex flex-wrap gap-2">
            {CUSTOMER_CATEGORIES.map((c) => (
              <Button
                key={c.key}
                variant={c.key === category ? "primary" : "secondary"}
                size="sm"
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">{activeCategoryLabel}</h2>
          <Button variant="primary" size="sm" onClick={openAddModal}>
            <Plus className="w-4 h-4" />
            Thêm
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin text-2xl">⟳</div>
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">Chưa có dữ liệu nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Giá trị
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Trạng thái
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`border-b border-border last:border-0 ${
                      item.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-sm font-medium text-foreground">
                      {item.value}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={item.is_active ? "success" : "muted"}>
                        {item.is_active ? "Đang dùng" : "Đã tắt"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleMove(item, "up")}
                          disabled={index === 0}
                          className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          title="Di chuyển lên"
                        >
                          <ArrowUp className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleMove(item, "down")}
                          disabled={index === items.length - 1}
                          className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          title="Di chuyển xuống"
                        >
                          <ArrowDown className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Pencil className="w-4 h-4 text-primary" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(item)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                          title={item.is_active ? "Tắt" : "Bật"}
                        >
                          <Power className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(item)}
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
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editingItem ? "Chỉnh sửa" : "Thêm mới"}
        onClose={closeModal}
      >
        <div className="space-y-4">
          <Input
            label="Giá trị"
            placeholder="Nhập giá trị"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            error={formError}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeModal}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      <AlertDialog
        open={!!pendingDelete}
        title="Xóa mục này?"
        description={
          pendingDelete
            ? `Bạn có chắc muốn xóa "${pendingDelete.value}"? Hành động này không thể hoàn tác.`
            : undefined
        }
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <Modal
        open={!!blockedDeleteValue}
        title="Không thể xóa"
        onClose={() => setBlockedDeleteValue(null)}
      >
        <p className="text-sm text-muted-foreground">
          {`"${blockedDeleteValue}" đang được sử dụng nên không thể xóa. Bạn có thể tắt (Disable) mục này thay vì xóa.`}
        </p>
        <div className="flex justify-end mt-6">
          <Button variant="secondary" onClick={() => setBlockedDeleteValue(null)}>
            Đã hiểu
          </Button>
        </div>
      </Modal>
    </div>
  );
}
