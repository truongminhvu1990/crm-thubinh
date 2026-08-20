"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { OrderItem, ProductDisposition } from "@/types/order";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  orderId: string;
  items: OrderItem[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * D12 Order Cancellation (Product Owner Authorization, 2026-08-19).
 * Decision A (LOCKED): disposition chosen per Product, no Order-wide
 * default — Confirm stays disabled until every item has one. Decision D
 * (LOCKED): warns if the Order already has compensation/commission data,
 * without blocking the action (Owner/Manager may still proceed).
 *
 * Thin, always-mounted wrapper around CancelOrderModalBody, which only
 * mounts while `open` — a fresh mount naturally starts with fresh
 * useState() initial values, no manual "reset form state on open" effect
 * needed (avoids a synchronous setState-in-effect, which this project's
 * eslint config flags).
 */
export default function CancelOrderModal({ open, orderId, items, onClose, onSaved }: Props) {
  return (
    <Modal open={open} title="Hủy đơn hàng" onClose={onClose} testId="order-cancel-modal">
      {open && <CancelOrderModalBody orderId={orderId} items={items} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function CancelOrderModalBody({
  orderId,
  items,
  onClose,
  onSaved,
}: Omit<Props, "open">) {
  const [dispositions, setDispositions] = useState<Record<string, ProductDisposition>>({});
  const [info, setInfo] = useState<{ hasCompensation: boolean; hasCommission: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/cancellation-info`);
        if (res.ok && !cancelled) setInfo(await res.json());
      } catch (err) {
        console.error("Failed to load cancellation info:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const allChosen = items.length > 0 && items.every((item) => !!dispositions[item.id!]);

  async function handleConfirm() {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispositions: items.map((item) => ({
            order_item_id: item.id,
            disposition: dispositions[item.id!],
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể hủy đơn hàng");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        Đơn hàng sẽ chuyển sang trạng thái <strong>Đã hủy</strong>. Lịch sử đơn hàng, thanh toán, hoa hồng và
        compensation vẫn được giữ nguyên — chọn disposition cho từng sản phẩm bên dưới.
      </p>

      {(info?.hasCompensation || info?.hasCommission) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-100 text-amber-800 text-sm px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Đơn hàng này đã có dữ liệu {info.hasCompensation && "compensation"}
            {info.hasCompensation && info.hasCommission && "/"}
            {info.hasCommission && "hoa hồng"}. Việc hủy đơn <strong>không</strong> tự động hoàn tác dữ liệu này.
          </span>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-3" data-testid={`order-cancel-item-${item.id}`}>
            <div className="text-sm font-medium text-foreground mb-2">
              {item.product?.product_name || item.product_id} ({item.product?.product_code || "—"})
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`disposition-${item.id}`}
                  data-testid={`order-cancel-item-${item.id}-remaining`}
                  checked={dispositions[item.id!] === "Remaining"}
                  onChange={() => setDispositions((prev) => ({ ...prev, [item.id!]: "Remaining" }))}
                />
                Trở lại kho
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`disposition-${item.id}`}
                  data-testid={`order-cancel-item-${item.id}-returned`}
                  checked={dispositions[item.id!] === "Returned"}
                  onChange={() => setDispositions((prev) => ({ ...prev, [item.id!]: "Returned" }))}
                />
                Trả NCC/xưởng
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="order-cancel-close-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Đóng
        </Button>
        <Button
          data-testid="order-cancel-confirm-button"
          variant="danger"
          onClick={handleConfirm}
          isLoading={isSaving}
          disabled={!allChosen}
        >
          Xác nhận hủy đơn
        </Button>
      </div>
    </>
  );
}
