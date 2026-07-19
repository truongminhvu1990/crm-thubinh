"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Customer } from "@/types/customer";
import { findCustomerByPhone } from "@/lib/customer.service";

type SaveResult = { data: Customer | null; error: unknown };
type SaveFn = (customer: Partial<Customer>) => Promise<SaveResult>;

/**
 * Shared Add/Edit save flow (validation, duplicate-phone check, save,
 * duplicate-warning dialog) - extracted because the Customer List and
 * Customer Detail pages each had their own copy of this exact logic.
 */
export function useCustomerSaveFlow(save: SaveFn) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pendingRef = useRef<{
    customer: Partial<Customer>;
    onSuccess: (data: Customer) => void;
  } | null>(null);

  function validate(customer: Partial<Customer>): Record<string, string> {
    const nextErrors: Record<string, string> = {};
    if (!customer.full_name) nextErrors.full_name = "Vui lòng nhập họ tên";
    if (!customer.phone) nextErrors.phone = "Vui lòng nhập số điện thoại";
    return nextErrors;
  }

  function focusFirstInvalidField(fieldErrors: Record<string, string>) {
    const firstField = ["full_name", "phone"].find((f) => fieldErrors[f]);
    if (firstField) document.getElementById(`customer-${firstField}`)?.focus();
  }

  async function commitSave(customer: Partial<Customer>, onSuccess: (data: Customer) => void) {
    setIsSaving(true);
    try {
      const { data, error } = await save(customer);
      if (error || !data) {
        setFormError("Lỗi khi lưu khách hàng");
        console.error(error);
        return;
      }
      onSuccess(data);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave(
    customer: Partial<Customer>,
    excludeId: string | undefined,
    onSuccess: (data: Customer) => void
  ) {
    const fieldErrors = validate(customer);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      focusFirstInvalidField(fieldErrors);
      return;
    }

    setErrors({});
    setFormError("");

    const duplicate = await findCustomerByPhone(customer.phone!, excludeId);
    if (duplicate) {
      pendingRef.current = { customer, onSuccess };
      setDuplicateCustomer(duplicate);
      return;
    }

    await commitSave(customer, onSuccess);
  }

  function handleOpenDuplicateProfile() {
    if (duplicateCustomer?.id) router.push(`/customers/${duplicateCustomer.id}`);
    setDuplicateCustomer(null);
    pendingRef.current = null;
  }

  async function handleContinueCreate() {
    setDuplicateCustomer(null);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) await commitSave(pending.customer, pending.onSuccess);
  }

  function resetErrors() {
    setErrors({});
    setFormError("");
  }

  return {
    errors,
    formError,
    duplicateCustomer,
    isSaving,
    handleSave,
    handleOpenDuplicateProfile,
    handleContinueCreate,
    resetErrors,
    dismissDuplicate: () => setDuplicateCustomer(null),
  };
}
