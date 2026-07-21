"use client";

import { useEffect, useState } from "react";
import { Ticket, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import SearchInput from "@/components/ui/SearchInput";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import VoucherStatusBadge from "@/components/marketing/VoucherStatusBadge";
import VoucherFormModal from "@/components/marketing/VoucherFormModal";
import { getCurrentStaff } from "@/lib/permission";
import { getVouchersPage, createVoucher, updateVoucher, setVoucherStatus } from "@/lib/marketing/voucher.service";
import { VOUCHER_STATUS_OPTIONS } from "@/lib/marketing/marketing.constants";
import { MarketingVoucher, VoucherStatus } from "@/types/marketingAutomation";

const ALL = "All";

export default function VoucherPage() {
  const [rows, setRows] = useState<MarketingVoucher[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "All">(ALL);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<MarketingVoucher | null>(null);

  async function load() {
    setIsLoading(true);
    const result = await getVouchersPage({ search: search || undefined, status: statusFilter, page });
    setRows(result.rows);
    setTotalCount(result.totalCount);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, [page, search, statusFilter]);

  async function handleSave(input: { code: string; name: string; description: string; customerId: string | null; startDate: string; endDate: string }) {
    const staff = await getCurrentStaff();
    if (editingVoucher) {
      await updateVoucher(editingVoucher.id!, input, staff?.id ?? null);
    } else {
      await createVoucher({ ...input, createdBy: staff?.id ?? null });
    }
    setModalOpen(false);
    setEditingVoucher(null);
    load();
  }

  async function handleStatusChange(voucher: MarketingVoucher, next: VoucherStatus) {
    const staff = await getCurrentStaff();
    await setVoucherStatus(voucher.id!, next, staff?.id ?? null);
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Ticket className="w-6 h-6" />
            Voucher
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Không có luồng đổi voucher (redemption) trong phạm vi này</p>
        </div>
        <Button onClick={() => { setEditingVoucher(null); setModalOpen(true); }}>
          <Plus className="w-4 h-4" />
          Voucher mới
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <SearchInput placeholder="Tìm theo mã hoặc tên..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} onClear={() => setSearch("")} />
          </div>
          <Select
            options={[{ value: ALL, label: "Tất cả trạng thái" }, ...VOUCHER_STATUS_OPTIONS]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as VoucherStatus | "All"); setPage(1); }}
            className="sm:w-48"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin text-2xl">⟳</div></div>
      ) : rows.length === 0 ? (
        <Card className="text-center py-12 text-muted-foreground text-sm">Chưa có voucher nào</Card>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mã</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tên</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hiệu lực</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gán cho</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((voucher) => (
                <tr key={voucher.id} className="border-b border-border last:border-0 hover:bg-muted/30 group">
                  <td className="px-5 py-3 text-sm font-medium text-foreground">{voucher.code}</td>
                  <td className="px-5 py-3 text-sm text-foreground">{voucher.name}</td>
                  <td className="px-5 py-3"><VoucherStatusBadge status={voucher.status} /></td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{voucher.start_date || "—"} - {voucher.end_date || "—"}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{voucher.customer?.full_name || "Chưa gán"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => { setEditingVoucher(voucher); setModalOpen(true); }}>Sửa</button>
                      <Select
                        options={VOUCHER_STATUS_OPTIONS.filter((o) => o.value !== voucher.status)}
                        placeholder="Đổi trạng thái"
                        className="text-xs py-1"
                        onChange={(e) => e.target.value && handleStatusChange(voucher, e.target.value as VoucherStatus)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MarketingPagination page={page} totalCount={totalCount} onPageChange={setPage} />

      <VoucherFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} voucher={editingVoucher} />
    </div>
  );
}
