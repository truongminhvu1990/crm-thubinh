"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Power, ArrowUp, ArrowDown, ArrowLeft, Database } from "lucide-react";
import { MasterDataCategory, MasterDataItem } from "@/types/masterData";
import { TagCategory, TagOption } from "@/types/tagOptions";
import {
  getMasterDataItems,
  addMasterDataItem,
  updateMasterDataItem,
  setMasterDataActive,
  deleteMasterDataItem,
  isMasterDataValueInUse,
  moveMasterDataItem,
} from "@/lib/masterData.service";
import {
  getAllTagOptions,
  addTagOption,
  updateTagOption,
  setTagOptionActive,
  deleteTagOption,
  isTagOptionValueInUse,
  moveTagOption,
} from "@/lib/tagOptions.service";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import AlertDialog from "@/components/ui/AlertDialog";

type CategoryGroup =
  | { key: MasterDataCategory; label: string; store: "master_data" }
  | { key: TagCategory; label: string; store: "tag_options" };

type Item = MasterDataItem | TagOption;

const GENERAL_CATEGORIES: CategoryGroup[] = [
  { key: "salesperson", label: "Nhân viên bán hàng", store: "master_data" },
  { key: "customer_stage", label: "Giai đoạn khách hàng", store: "master_data" },
];

const PRODUCT_CATEGORIES: CategoryGroup[] = [
  { key: "product_category", label: "Danh mục sản phẩm", store: "master_data" },
  { key: "product_source", label: "Nguồn hàng", store: "master_data" },
  { key: "product_color", label: "Màu sắc sản phẩm", store: "master_data" },
];

const CUSTOMER_CATEGORIES: CategoryGroup[] = [
  { key: "country", label: "Quốc gia", store: "master_data" },
  { key: "market", label: "Thị trường", store: "master_data" },
  { key: "customer_source", label: "Nguồn khách hàng", store: "master_data" },
  { key: "follow_up_status", label: "Trạng thái chăm sóc", store: "master_data" },
];

const PAYMENT_CATEGORIES: CategoryGroup[] = [
  { key: "payment_method", label: "Phương thức thanh toán", store: "master_data" },
];

const SHIPPING_CATEGORIES: CategoryGroup[] = [
  { key: "shipping_provider", label: "Đơn vị vận chuyển", store: "master_data" },
  { key: "bank", label: "Ngân hàng", store: "master_data" },
];

const TAG_CATEGORIES: CategoryGroup[] = [
  { key: "favorite_color", label: "Màu sắc yêu thích", store: "tag_options" },
  { key: "jade_type", label: "Loại sản phẩm quan tâm", store: "tag_options" },
  { key: "purchase_purpose", label: "Mục đích mua hàng", store: "tag_options" },
  { key: "product_jade_grade", label: "Cấp độ ngọc", store: "tag_options" },
  { key: "customer_tag", label: "Thẻ khách hàng", store: "tag_options" },
];

const CATEGORY_SECTIONS: { title: string; groups: CategoryGroup[] }[] = [
  { title: "Chung", groups: GENERAL_CATEGORIES },
  { title: "Sản phẩm", groups: PRODUCT_CATEGORIES },
  { title: "Khách hàng", groups: CUSTOMER_CATEGORIES },
  { title: "Thanh toán", groups: PAYMENT_CATEGORIES },
  { title: "Vận chuyển", groups: SHIPPING_CATEGORIES },
  { title: "Tags", groups: TAG_CATEGORIES },
];

const ALL_GROUPS = CATEGORY_SECTIONS.flatMap((s) => s.groups);

function isDuplicateValue(items: Item[], value: string, excludeId?: string) {
  const normalized = value.trim().toLowerCase();
  return items.some(
    (item) => item.id !== excludeId && item.value.trim().toLowerCase() === normalized
  );
}

export default function MasterDataPage() {
  const [activeGroup, setActiveGroup] = useState<CategoryGroup>(GENERAL_CATEGORIES[0]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [valueInput, setValueInput] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [blockedDeleteValue, setBlockedDeleteValue] = useState<string | null>(null);

  async function loadItems(group: CategoryGroup) {
    setIsLoading(true);
    const data =
      group.store === "master_data"
        ? await getMasterDataItems(group.key)
        : await getAllTagOptions(group.key);
    setItems(data);
    setIsLoading(false);
  }

  useEffect(() => {
    loadItems(activeGroup);
  }, [activeGroup]);

  function openAddModal() {
    setEditingItem(null);
    setValueInput("");
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(item: Item) {
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
        ? activeGroup.store === "master_data"
          ? await updateMasterDataItem(editingItem.id, value)
          : await updateTagOption(editingItem.id, value)
        : activeGroup.store === "master_data"
          ? await addMasterDataItem(activeGroup.key, value)
          : await addTagOption(activeGroup.key, value);

      if (result.error) {
        setFormError(result.isDuplicate ? "Giá trị đã tồn tại" : "Lỗi khi lưu, vui lòng thử lại");
        return;
      }

      closeModal();
      await loadItems(activeGroup);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(item: Item) {
    setIsLoading(true);
    const { error } =
      activeGroup.store === "master_data"
        ? await setMasterDataActive(item.id, !item.is_active)
        : await setTagOptionActive(item.id, !item.is_active);
    if (error) {
      alert("Lỗi khi cập nhật trạng thái, vui lòng thử lại");
      setIsLoading(false);
      return;
    }
    await loadItems(activeGroup);
  }

  async function handleDelete(item: Item) {
    setIsLoading(true);
    const error =
      activeGroup.store === "master_data"
        ? await deleteMasterDataItem(item.id)
        : await deleteTagOption(item.id);
    if (error) {
      alert("Lỗi khi xóa, vui lòng thử lại");
      setIsLoading(false);
      return;
    }
    await loadItems(activeGroup);
  }

  async function handleDeleteClick(item: Item) {
    const inUse =
      activeGroup.store === "master_data"
        ? await isMasterDataValueInUse(activeGroup.key, item.value)
        : await isTagOptionValueInUse(activeGroup.key, item.value);
    if (inUse) {
      setBlockedDeleteValue(item.value);
      return;
    }
    setPendingDelete(item);
  }

  async function handleMove(item: Item, direction: "up" | "down") {
    setIsLoading(true);
    const error =
      activeGroup.store === "master_data"
        ? await moveMasterDataItem(items as MasterDataItem[], item.id, direction)
        : await moveTagOption(items as TagOption[], item.id, direction);
    if (error) {
      alert("Lỗi khi sắp xếp, vui lòng thử lại");
      setIsLoading(false);
      return;
    }
    await loadItems(activeGroup);
  }

  const activeCategoryLabel = ALL_GROUPS.find((g) => g.key === activeGroup.key)?.label || "";

  return (
    <div className="pb-8">
      <div className="mb-6">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Cài đặt
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Database className="w-6 h-6 text-primary" />
          Dữ liệu dùng chung
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Quản lý các danh mục lựa chọn dùng chung trong toàn hệ thống (Master Data)
        </p>
      </div>

      <div className="mb-6 space-y-3">
        {CATEGORY_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {section.title}
            </p>
            <div className="flex flex-wrap gap-2">
              {section.groups.map((g) => (
                <Button
                  key={g.key}
                  variant={g.key === activeGroup.key ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setActiveGroup(g)}
                >
                  {g.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">{activeCategoryLabel}</h2>
          <Button data-testid="master-data-add-button" variant="primary" size="sm" onClick={openAddModal}>
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
            <table data-testid="master-data-table" className="w-full">
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
        testId="master-data-modal"
      >
        <div className="space-y-4">
          <Input
            data-testid="master-data-value-input"
            label="Giá trị"
            placeholder="Nhập giá trị"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            error={formError}
          />
          <div className="flex justify-end gap-3">
            <Button data-testid="master-data-cancel-button" variant="secondary" onClick={closeModal}>
              Hủy
            </Button>
            <Button data-testid="master-data-save-button" variant="primary" onClick={handleSave} isLoading={isSaving}>
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      <AlertDialog
        testId="master-data-delete"
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
