"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Gem, Download, Upload, X } from "lucide-react";
import { Customer } from "@/types/customer";
import { CustomerPurchaseSummary } from "@/types/purchase";
import { getCustomers, addCustomer, updateCustomer, deleteCustomer } from "@/lib/customer.service";
import { getPurchaseSummaries } from "@/lib/purchase.service";
import { REVENUE_FILTERS } from "@/lib/purchase.constants";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { useCustomerSaveFlow } from "@/lib/hooks/useCustomerSaveFlow";
import { exportCustomersToCsv } from "@/lib/customerImportExport";
import CustomerTable from "@/components/customer/CustomerTable";
import CustomerModal from "@/components/customer/CustomerModal";
import CustomerImportModal from "@/components/customer/CustomerImportModal";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import AlertDialog from "@/components/ui/AlertDialog";

const EMPTY_CUSTOMER: Partial<Customer> = {
  customer_code: "",
  full_name: "",
  phone: "",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [purchaseSummaries, setPurchaseSummaries] = useState<Map<string, CustomerPurchaseSummary>>(
    new Map()
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [revenueFilter, setRevenueFilter] = useState<string>("ALL");
  const [marketFilter, setMarketFilter] = useState<string>("ALL");
  const [countryFilter, setCountryFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer>>(EMPTY_CUSTOMER);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const marketOptions = useMasterDataOptions("market");
  const countryOptions = useMasterDataOptions("country");

  const saveFlow = useCustomerSaveFlow((data) =>
    isEditing && currentCustomer.id ? updateCustomer(currentCustomer.id, data) : addCustomer(data)
  );

  const hasActiveFilters =
    searchTerm !== "" ||
    filterType !== "ALL" ||
    revenueFilter !== "ALL" ||
    marketFilter !== "ALL" ||
    countryFilter !== "ALL";

  async function loadCustomers() {
    setIsLoading(true);
    const [data, summaries] = await Promise.all([getCustomers(), getPurchaseSummaries()]);
    setCustomers(data);
    setPurchaseSummaries(summaries);
    filterCustomers(data, summaries, searchTerm, filterType, revenueFilter, marketFilter, countryFilter);
    setIsLoading(false);
  }

  function filterCustomers(
    data: Customer[],
    summaries: Map<string, CustomerPurchaseSummary>,
    search: string,
    type: string,
    revenue: string,
    market: string,
    country: string
  ) {
    let filtered = data;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.full_name.toLowerCase().includes(searchLower) ||
          c.customer_code.toLowerCase().includes(searchLower) ||
          c.phone.includes(search)
      );
    }

    if (type === "VIP") {
      filtered = filtered.filter((c) => c.vip_level === "VIP");
    } else if (type === "NORMAL") {
      filtered = filtered.filter((c) => c.vip_level !== "VIP");
    }

    if (revenue !== "ALL") {
      const threshold = Number(revenue);
      filtered = filtered.filter(
        (c) => ((c.id && summaries.get(c.id)?.totalRevenue) || 0) > threshold
      );
    }

    if (market !== "ALL") {
      filtered = filtered.filter((c) => c.province === market);
    }

    if (country !== "ALL") {
      filtered = filtered.filter((c) => c.country === country);
    }

    setFilteredCustomers(filtered);
  }

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    filterCustomers(customers, purchaseSummaries, value, filterType, revenueFilter, marketFilter, countryFilter);
  }

  function handleFilterChange(value: string) {
    setFilterType(value);
    filterCustomers(customers, purchaseSummaries, searchTerm, value, revenueFilter, marketFilter, countryFilter);
  }

  function handleRevenueFilterChange(value: string) {
    setRevenueFilter(value);
    filterCustomers(customers, purchaseSummaries, searchTerm, filterType, value, marketFilter, countryFilter);
  }

  function handleMarketFilterChange(value: string) {
    setMarketFilter(value);
    filterCustomers(customers, purchaseSummaries, searchTerm, filterType, revenueFilter, value, countryFilter);
  }

  function handleCountryFilterChange(value: string) {
    setCountryFilter(value);
    filterCustomers(customers, purchaseSummaries, searchTerm, filterType, revenueFilter, marketFilter, value);
  }

  function handleClearFilters() {
    setSearchTerm("");
    setFilterType("ALL");
    setRevenueFilter("ALL");
    setMarketFilter("ALL");
    setCountryFilter("ALL");
    filterCustomers(customers, purchaseSummaries, "", "ALL", "ALL", "ALL", "ALL");
  }

  async function handleSaveCustomer() {
    await saveFlow.handleSave(currentCustomer, currentCustomer.id, async () => {
      setModalOpen(false);
      setCurrentCustomer(EMPTY_CUSTOMER);
      setIsEditing(false);
      await loadCustomers();
    });
  }

  function handleExportCsv() {
    const csv = exportCustomersToCsv(filteredCustomers);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteCustomer(customer: Customer) {
    setIsLoading(true);
    try {
      const error = await deleteCustomer(customer.id!);
      if (error) throw error;
      await loadCustomers();
    } catch (error) {
      alert("Lỗi khi xóa khách hàng");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleEditCustomer(customer: Customer) {
    setCurrentCustomer(customer);
    setIsEditing(true);
    saveFlow.resetErrors();
    setModalOpen(true);
  }

  function handleAddCustomer() {
    setCurrentCustomer(EMPTY_CUSTOMER);
    setIsEditing(false);
    saveFlow.resetErrors();
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setCurrentCustomer(EMPTY_CUSTOMER);
    setIsEditing(false);
    saveFlow.resetErrors();
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  const vipCount = customers.filter((c) => c.vip_level === "VIP").length;

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Khách hàng
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {customers.length} khách hàng · Hiển thị {filteredCustomers.length}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium">
          <Gem className="w-4 h-4" />
          {vipCount} khách VIP
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <SearchInput
              placeholder="Tìm theo tên, mã hoặc số điện thoại..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onClear={() => handleSearchChange("")}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={filterType}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả khách hàng</option>
              <option value="VIP">VIP</option>
              <option value="NORMAL">Normal</option>
            </select>

            <select
              value={revenueFilter}
              onChange={(e) => handleRevenueFilterChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Mọi doanh thu</option>
              {REVENUE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={countryFilter}
              onChange={(e) => handleCountryFilterChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả quốc gia</option>
              {countryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={marketFilter}
              onChange={(e) => handleMarketFilterChange(e.target.value)}
              className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">Tất cả thị trường</option>
              {marketOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <Button variant="secondary" size="md" onClick={handleClearFilters}>
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Xóa bộ lọc</span>
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={loadCustomers}>
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Làm mới</span>
            </Button>
            <Button variant="secondary" size="md" onClick={handleExportCsv}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Xuất CSV</span>
            </Button>
            <Button variant="secondary" size="md" onClick={() => setImportModalOpen(true)}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Nhập CSV</span>
            </Button>
            <Button variant="primary" size="md" onClick={handleAddCustomer} className="whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Thêm khách
            </Button>
          </div>
        </div>
      </div>

      <CustomerTable
        customers={filteredCustomers}
        purchaseSummaries={purchaseSummaries}
        onEdit={handleEditCustomer}
        onDelete={handleDeleteCustomer}
        isLoading={isLoading}
      />

      <CustomerModal
        open={modalOpen}
        title={isEditing ? "Chỉnh sửa khách hàng" : "Thêm khách hàng mới"}
        customer={currentCustomer}
        setCustomer={setCurrentCustomer}
        errors={saveFlow.errors}
        formError={saveFlow.formError}
        onSave={handleSaveCustomer}
        onClose={handleCloseModal}
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

      <CustomerImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={loadCustomers}
      />
    </div>
  );
}
