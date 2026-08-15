"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, Plus, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { CompensationPolicy, CreateCompensationPolicyInput } from "@/types/compensation";
import {
  compensationTypeLabel,
  COMPENSATION_TYPE_OPTIONS,
  COMPENSATION_POLICY_METHOD_OPTIONS,
  COMPENSATION_POLICY_STATUS_OPTIONS,
} from "@/lib/compensation/compensation.constants";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CurrencyInput from "@/components/ui/CurrencyInput";
import Modal from "@/components/ui/Modal";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/** Calculation Basis is fixed to "Sale Price" (Product Owner Decision) — no
 * other Basis (Received Amount / Profit / Fixed Value,
 * docs/13_COMPENSATION_SPEC.md §9) has a calculation formula implemented in
 * createCompensationsForOrder, so the Create/Edit form does not offer them. */
const FIXED_BASIS = "Sale Price";

const EMPTY_FORM: CreateCompensationPolicyInput = {
  policy_name: "",
  compensation_type: COMPENSATION_TYPE_OPTIONS[0].value,
  basis: FIXED_BASIS,
  method: "Percentage",
  value: 0,
  status: "Active",
};

export default function CompensationPoliciesPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<CompensationPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CompensationPolicy | null>(null);
  const [form, setForm] = useState<CreateCompensationPolicyInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<Partial<Record<keyof CreateCompensationPolicyInput, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  async function loadPolicies() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/compensations/policies");
      setPolicies(res.ok ? await res.json() : []);
    } catch (error) {
      console.error("Failed to load compensation policies:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadPolicies();
    });
  }, []);

  function openCreateModal() {
    setEditingPolicy(null);
    setForm(EMPTY_FORM);
    setFormError({});
    setModalOpen(true);
  }

  function openEditModal(policy: CompensationPolicy) {
    setEditingPolicy(policy);
    setForm({
      policy_name: policy.policy_name,
      compensation_type: policy.compensation_type,
      basis: FIXED_BASIS,
      method: policy.method,
      value: policy.value,
      status: policy.status,
    });
    setFormError({});
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingPolicy(null);
    setFormError({});
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof CreateCompensationPolicyInput, string>> = {};

    if (!form.policy_name.trim()) errors.policy_name = "Vui lòng nhập tên Policy";

    if (!form.value || form.value <= 0) {
      errors.value = "Giá trị phải lớn hơn 0";
    } else if (form.method === "Percentage" && form.value > 100) {
      errors.value = "Tỷ lệ phần trăm không được vượt quá 100%";
    }

    setFormError(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        editingPolicy ? `/api/compensations/policies/${editingPolicy.id}` : "/api/compensations/policies",
        {
          method: editingPolicy ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, policy_name: form.policy_name.trim() }),
        }
      );
      if (!res.ok) {
        setFormError({ policy_name: "Lỗi khi lưu, vui lòng thử lại" });
        return;
      }
      closeModal();
      await loadPolicies();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="pb-8">
      <button
        onClick={() => router.push("/compensations")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary mb-6 transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-primary/5"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại Compensation
      </button>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Compensation Policy
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Quản lý các Policy tính hoa hồng theo Phần trăm hoặc Số tiền cố định.
          </p>
        </div>
        <Button data-testid="compensation-policy-add-button" variant="primary" size="sm" onClick={openCreateModal}>
          <Plus className="w-4 h-4" />
          Tạo Policy
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-card rounded-xl p-12 text-center border border-border">
          <p className="text-muted-foreground text-sm">Chưa có Compensation Policy nào</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table data-testid="compensation-policy-table" className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tên Policy</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loại Compensation</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cơ sở tính</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phương thức</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giá trị</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5 text-sm font-medium text-foreground">{policy.policy_name}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{compensationTypeLabel(policy.compensation_type)}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{policy.basis}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">{policy.method}</td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">
                    {policy.method === "Percentage" ? `${policy.value}%` : currency.format(policy.value)}
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    <Badge variant={policy.status === "Active" ? "success" : "muted"}>{policy.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      data-testid={`compensation-policy-edit-${policy.id}`}
                      onClick={() => openEditModal(policy)}
                      className="p-3 hover:bg-primary/10 rounded-lg transition-colors touch-manipulation"
                      title="Chỉnh sửa"
                    >
                      <Pencil className="w-4 h-4 text-primary" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editingPolicy ? "Chỉnh sửa Policy" : "Tạo Policy"}
        onClose={closeModal}
        testId="compensation-policy-modal"
      >
        <div className="space-y-4">
          <Input
            data-testid="compensation-policy-name-input"
            label="Tên Policy"
            placeholder="VD: Đối tác giới thiệu — mặc định"
            value={form.policy_name}
            onChange={(e) => setForm({ ...form, policy_name: e.target.value })}
            error={formError.policy_name}
          />

          <Select
            data-testid="compensation-policy-type-select"
            label="Loại Compensation"
            options={COMPENSATION_TYPE_OPTIONS}
            value={form.compensation_type}
            onChange={(e) => setForm({ ...form, compensation_type: e.target.value })}
          />

          <div className="w-full">
            <label className="block text-sm font-medium text-foreground mb-1.5">Cơ sở tính</label>
            <input
              disabled
              value={FIXED_BASIS}
              className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground outline-none"
            />
          </div>

          <Select
            data-testid="compensation-policy-method-select"
            label="Phương thức tính"
            options={COMPENSATION_POLICY_METHOD_OPTIONS}
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value, value: 0 })}
          />

          {form.method === "Percentage" ? (
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground mb-1.5">Giá trị (%)</label>
              <div className="relative">
                <input
                  data-testid="compensation-policy-value-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  placeholder="VD: 10"
                  value={form.value || ""}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 pr-8 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              {formError.value && <p className="text-destructive text-xs mt-1">{formError.value}</p>}
            </div>
          ) : (
            <CurrencyInput
              testId="compensation-policy-value-input"
              label="Số tiền cố định (VND)"
              placeholder="VD: 500.000"
              value={form.value}
              onChange={(v) => setForm({ ...form, value: v ?? 0 })}
              error={formError.value}
            />
          )}

          <Select
            data-testid="compensation-policy-status-select"
            label="Trạng thái"
            options={COMPENSATION_POLICY_STATUS_OPTIONS}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          />

          <div className="flex justify-end gap-3">
            <Button data-testid="compensation-policy-cancel-button" variant="secondary" onClick={closeModal}>
              Hủy
            </Button>
            <Button data-testid="compensation-policy-save-button" variant="primary" onClick={handleSave} isLoading={isSaving}>
              Lưu
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
