"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Images, UploadCloud, Link2, Trash2, GripVertical, Loader2, ArrowUp, ArrowDown, Star } from "lucide-react";
import { ProductImage } from "@/types/productImage";
import {
  getProductImages,
  addProductImageUrls,
  uploadProductImageFiles,
  deleteProductImage,
  setImageOrder,
} from "@/lib/productImage.service";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import AlertDialog from "@/components/ui/AlertDialog";

interface Props {
  productId: string;
  onChange?: (images: ProductImage[]) => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export default function ProductImageManager({ productId, onChange }: Props) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProductImage | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setIsLoading(true);
    const data = await getProductImages(productId);
    setImages(data);
    onChange?.(data);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      const files = imageFiles.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
      const oversizedCount = imageFiles.length - files.length;

      if (files.length === 0) {
        if (oversizedCount > 0) alert("Ảnh vượt quá 10MB, vui lòng chọn ảnh nhỏ hơn");
        return;
      }

      setIsUploading(true);
      try {
        const { error } = await uploadProductImageFiles(productId, files);
        if (error) alert("Một số ảnh tải lên thất bại, vui lòng thử lại");
        else if (oversizedCount > 0) alert(`${oversizedCount} ảnh vượt quá 10MB đã bị bỏ qua`);
        await load();
      } finally {
        setIsUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productId]
  );

  async function handleAddUrls() {
    const lines = urlInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setUrlError("Vui lòng nhập ít nhất một URL");
      return;
    }

    if (lines.some((l) => !/^https?:\/\//i.test(l))) {
      setUrlError("URL phải bắt đầu bằng http:// hoặc https://");
      return;
    }

    setUrlError("");
    const { error } = await addProductImageUrls(productId, lines);
    if (error) {
      setUrlError("Lỗi khi thêm URL, vui lòng thử lại");
      return;
    }

    setUrlInput("");
    await load();
  }

  async function handleDelete(image: ProductImage) {
    const error = await deleteProductImage(image);
    if (error) {
      alert("Lỗi khi xóa ảnh, vui lòng thử lại");
      return;
    }
    await load();
  }

  async function commitReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;

    const reordered = [...images];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setImages(reordered);
    const error = await setImageOrder(reordered);
    if (error) alert("Lỗi khi sắp xếp lại ảnh, vui lòng thử lại");
    await load();
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Images className="w-5 h-5" />
        Ảnh sản phẩm
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          isDraggingOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
      >
        {isUploading ? (
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        ) : (
          <UploadCloud className="w-6 h-6 text-muted-foreground" />
        )}
        <p className="text-sm text-foreground font-medium">Kéo thả ảnh vào đây hoặc bấm để chọn</p>
        <p className="text-xs text-muted-foreground">Có thể chọn nhiều ảnh cùng lúc</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
          <Link2 className="w-4 h-4" />
          Thêm bằng URL (mỗi dòng một URL, tự nhận diện link Google Drive)
        </label>
        <textarea
          placeholder={"https://...\nhttps://drive.google.com/file/d/..."}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {urlError && <p className="text-destructive text-xs mt-1">{urlError}</p>}
        <div className="flex justify-end mt-2">
          <Button variant="secondary" size="sm" onClick={handleAddUrls}>
            Thêm URL
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : images.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Chưa có ảnh nào</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mt-4 mb-2">
            Kéo thả để sắp xếp lại - ảnh đầu tiên luôn là ảnh đại diện sản phẩm.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((image, index) => (
              <div key={image.id}>
                <div
                  draggable
                  onDragStart={() => setDraggedIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index);
                  }}
                  onDragLeave={() => setDragOverIndex((current) => (current === index ? null : current))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null) commitReorder(draggedIndex, index);
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`relative group rounded-lg overflow-hidden border bg-muted aspect-square cursor-grab active:cursor-grabbing transition-colors ${
                    dragOverIndex === index ? "border-primary ring-2 ring-primary/30" : "border-border"
                  } ${draggedIndex === index ? "opacity-40" : ""}`}
                >
                  <img src={image.image_url} alt="Ảnh sản phẩm" className="w-full h-full object-cover" />

                  {index === 0 && (
                    <Badge variant="vip" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5">
                      Ảnh đại diện
                    </Badge>
                  )}

                  <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/80 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>

                  <div className="absolute bottom-1.5 right-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setPendingDelete(image)}
                      className="p-1.5 rounded-md bg-white/90 hover:bg-white shadow-sm"
                      title="Xóa ảnh"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1 mt-1.5">
                  <button
                    onClick={() => commitReorder(index, index - 1)}
                    disabled={index === 0}
                    title="Di chuyển lên"
                    className="p-1.5 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => commitReorder(index, index + 1)}
                    disabled={index === images.length - 1}
                    title="Di chuyển xuống"
                    className="p-1.5 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => commitReorder(index, 0)}
                    disabled={index === 0}
                    title="Đặt làm ảnh đại diện"
                    className="p-1.5 rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Star className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AlertDialog
        open={!!pendingDelete}
        title="Xóa ảnh này?"
        description="Hành động này không thể hoàn tác."
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </Card>
  );
}
