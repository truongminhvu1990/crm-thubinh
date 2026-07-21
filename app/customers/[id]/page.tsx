"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Customer } from "@/types/customer";
import { getCustomerById, updateCustomer } from "@/lib/customer.service";
import { useCustomerSaveFlow } from "@/lib/hooks/useCustomerSaveFlow";
import { formatDate } from "@/lib/utils";
import Button from "@/components/ui/Button";
import AlertDialog from "@/components/ui/AlertDialog";
import CustomerModal from "@/components/customer/CustomerModal";
import CustomerProfileHeader from "@/components/customer/CustomerProfileHeader";
import CustomerRevenueSummary from "@/components/customer/CustomerRevenueSummary";
import CustomerNotesTimeline from "@/components/customer/CustomerNotesTimeline";
import CustomerFollowUp from "@/components/customer/CustomerFollowUp";
import CustomerVipCare from "@/components/customer/CustomerVipCare";
import CustomerJadePreferences from "@/components/customer/CustomerJadePreferences";
import CustomerMatchingProducts from "@/components/customer/CustomerMatchingProducts";
import CustomerPurchaseHistory from "@/components/customer/CustomerPurchaseHistory";

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Partial<Customer>>({});

  const saveFlow = useCustomerSaveFlow((data) => updateCustomer(customer!.id!, data));

  async function loadCustomer() {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await getCustomerById(id);
      setCustomer(data);
      setEditCustomer(data || {});
    } catch (error) {
      console.error("Failed to load customer:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveCustomer() {
    if (!customer?.id) return;
    await saveFlow.handleSave(editCustomer, customer.id, (data) => {
      setCustomer(data);
      setModalOpen(false);
    });
  }

  useEffect(() => {
    loadCustomer();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Không tìm thấy khách hàng</p>
        <Button onClick={() => router.back()} className="mt-4">
          Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary mb-6 transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-primary/5"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại
      </button>

      <div className="space-y-6">
        <CustomerProfileHeader
          customer={customer}
          onEdit={() => {
            setEditCustomer(customer);
            saveFlow.resetErrors();
            setModalOpen(true);
          }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CustomerVipCare customer={customer} onUpdate={setCustomer} />
            <CustomerRevenueSummary customer={customer} />
            <CustomerNotesTimeline customer={customer} onUpdate={setCustomer} />
            <CustomerPurchaseHistory customer={customer} />
            <CustomerJadePreferences customer={customer} />
            <CustomerMatchingProducts customer={customer} />
          </div>
          <div className="space-y-6">
            <CustomerFollowUp customer={customer} onUpdate={setCustomer} />
          </div>
        </div>

        {(customer.created_at || customer.updated_at) && (
          <p className="text-xs text-muted-foreground text-center">
            {customer.created_at && `Tạo lúc ${formatDate(customer.created_at)}`}
            {customer.created_at && customer.updated_at && " · "}
            {customer.updated_at && `Cập nhật lần cuối ${formatDate(customer.updated_at)}`}
          </p>
        )}
      </div>

      <CustomerModal
        open={modalOpen}
        title="Chỉnh sửa thông tin khách hàng"
        customer={editCustomer}
        setCustomer={setEditCustomer}
        errors={saveFlow.errors}
        formError={saveFlow.formError}
        onSave={handleSaveCustomer}
        onClose={() => {
          setModalOpen(false);
          saveFlow.resetErrors();
        }}
        isLoading={saveFlow.isSaving}
      />

      <AlertDialog
        open={!!saveFlow.duplicateCustomer}
        title="Khách hàng với số điện thoại này đã tồn tại."
        confirmLabel="Tiếp tục tạo"
        cancelLabel="Mở hồ sơ khách hàng"
        confirmVariant="primary"
        onOpenChange={(open) => !open && saveFlow.dismissDuplicate()}
        onCancel={saveFlow.handleOpenDuplicateProfile}
        onConfirm={saveFlow.handleContinueCreate}
      />
    </div>
  );
}
