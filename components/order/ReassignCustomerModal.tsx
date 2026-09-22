"use client";

import { useState } from "react";
import { getCustomers } from "@/lib/customer.service";
import { Customer } from "@/types/customer";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";

interface Props {
  open: boolean;
  orderId: string;
  currentCustomerId: string;
  currentCustomerLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Order Customer Editable Before Completion (Product Owner PD, APPROVED
 * 2026-09-22) — Đổi khách hàng, same picker pattern as app/orders/new/page.tsx's
 * own Customer search (search by name/phone, click a result to select), same
 * modal shape as ReassignSalesOwnerModal. Blocked from even opening once the
 * Order is Completed — the trigger button itself is gated by
 * canChangeOrderCustomer in the parent page, this modal doesn't re-check it,
 * matching ReassignSalesOwnerModal's own convention (the server is the real
 * enforcement point either way). */
export default function ReassignCustomerModal({
  open,
  orderId,
  currentCustomerId,
  currentCustomerLabel,
  onClose,
  onSaved,
}: Props) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  async function handleCustomerSearch(value: string) {
    setCustomerSearch(value);
    setSelectedCustomer(null);
    if (!value) {
      setCustomerResults([]);
      return;
    }
    setCustomerResults(await getCustomers(value));
  }

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.full_name);
    setCustomerResults([]);
  }

  async function handleSave() {
    setError(null);
    if (!selectedCustomer?.id) {
      setError("Vui lòng chọn khách hàng");
      return;
    }
    if (selectedCustomer.id === currentCustomerId) {
      setError("Khách hàng mới phải khác khách hàng hiện tại");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/reassign-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: selectedCustomer.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Không thể đổi khách hàng");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} title="Đổi khách hàng" onClose={onClose} testId="order-reassign-customer-modal">
      {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}

      <p className="text-sm text-muted-foreground mb-3">
        Khách hàng hiện tại: <span className="font-medium text-foreground">{currentCustomerLabel}</span>
      </p>

      <div className="relative">
        <SearchInput
          data-testid="order-reassign-customer-search-input"
          placeholder="Tìm khách hàng mới theo tên hoặc số điện thoại..."
          value={customerSearch}
          onChange={(e) => handleCustomerSearch(e.target.value)}
          onClear={() => handleCustomerSearch("")}
        />
        {customerResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {customerResults.map((customer) => (
              <button
                key={customer.id}
                type="button"
                data-testid={`order-reassign-customer-option-${customer.id}`}
                onClick={() => selectCustomer(customer)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
              >
                {customer.full_name} · {customer.phone}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button data-testid="order-reassign-customer-cancel-button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button
          data-testid="order-reassign-customer-save-button"
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={!selectedCustomer}
        >
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
