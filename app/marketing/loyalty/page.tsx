"use client";

import { useEffect, useState } from "react";
import { Gift, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import SearchInput from "@/components/ui/SearchInput";
import Select from "@/components/ui/Select";
import MarketingPagination from "@/components/marketing/MarketingPagination";
import LoyaltyTxnTypeBadge from "@/components/marketing/LoyaltyTxnTypeBadge";
import LoyaltyRuleFormModal from "@/components/marketing/LoyaltyRuleFormModal";
import LoyaltyTransactionFormModal from "@/components/marketing/LoyaltyTransactionFormModal";
import { cn, formatDate } from "@/lib/utils";
import { getCurrentStaff } from "@/lib/permission";
import {
  getRulesPage,
  createRule,
  updateRule,
  setRuleStatus,
  getTransactionsPage,
  recordTransaction,
  getCustomerBalance,
  searchCustomersForBalance,
} from "@/lib/marketing/loyalty.service";
import { MarketingLoyaltyRule, MarketingLoyaltyTransaction, CustomerLoyaltyBalance } from "@/types/marketingAutomation";

type Tab = "rules" | "balance" | "transactions";

export default function LoyaltyPage() {
  const [tab, setTab] = useState<Tab>("rules");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Gift className="w-6 h-6" />
          Loyalty
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Nền tảng tích điểm - chỉ ghi nhận thủ công, chưa tính điểm tự động</p>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {(["rules", "balance", "transactions"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "rules" ? "Quy tắc" : t === "balance" ? "Số dư khách hàng" : "Lịch sử giao dịch"}
          </button>
        ))}
      </div>

      {tab === "rules" && <RulesTab />}
      {tab === "balance" && <BalanceTab />}
      {tab === "transactions" && <TransactionsTab />}
    </div>
  );
}

function RulesTab() {
  const [rows, setRows] = useState<MarketingLoyaltyRule[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<MarketingLoyaltyRule | null>(null);

  async function load() {
    setIsLoading(true);
    const result = await getRulesPage(page);
    setRows(result.rows);
    setTotalCount(result.totalCount);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, [page]);

  async function handleSave(input: { name: string; description: string; pointsValue: number }) {
    const staff = await getCurrentStaff();
    if (editingRule) {
      await updateRule(editingRule.id!, input, staff?.id ?? null);
    } else {
      await createRule({ ...input, createdBy: staff?.id ?? null });
    }
    setModalOpen(false);
    setEditingRule(null);
    load();
  }

  async function handleToggleStatus(rule: MarketingLoyaltyRule) {
    const staff = await getCurrentStaff();
    await setRuleStatus(rule.id!, rule.status === "Active" ? "Inactive" : "Active", staff?.id ?? null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditingRule(null); setModalOpen(true); }}>
          <Plus className="w-4 h-4" />
          Quy tắc mới
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin text-2xl">⟳</div></div>
      ) : rows.length === 0 ? (
        <Card className="text-center py-12 text-muted-foreground text-sm">Chưa có quy tắc nào</Card>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tên</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Điểm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-3 text-sm font-medium text-foreground">{rule.name}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{rule.points_value}</td>
                  <td className="px-5 py-3"><Badge variant={rule.status === "Active" ? "success" : "muted"}>{rule.status}</Badge></td>
                  <td className="px-5 py-3 text-right">
                    <button className="text-xs text-muted-foreground hover:text-primary mr-3" onClick={() => { setEditingRule(rule); setModalOpen(true); }}>Sửa</button>
                    <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => handleToggleStatus(rule)}>
                      {rule.status === "Active" ? "Vô hiệu hóa" : "Kích hoạt"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MarketingPagination page={page} totalCount={totalCount} onPageChange={setPage} />

      <LoyaltyRuleFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} rule={editingRule} />
    </div>
  );
}

function BalanceTab() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; full_name: string; customer_code: string }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; full_name: string; customer_code: string } | null>(null);
  const [balance, setBalance] = useState<CustomerLoyaltyBalance | null>(null);
  const [txnModalOpen, setTxnModalOpen] = useState(false);

  useEffect(() => {
    if (!search) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => searchCustomersForBalance(search).then(setResults), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  async function selectCustomer(c: { id: string; full_name: string; customer_code: string }) {
    setSelectedCustomer(c);
    setResults([]);
    setSearch(`${c.customer_code} · ${c.full_name}`);
    setBalance(await getCustomerBalance(c.id));
  }

  return (
    <div className="space-y-4">
      <Card>
        <SearchInput placeholder="Tìm khách hàng theo tên hoặc mã..." value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => { setSearch(""); setSelectedCustomer(null); setBalance(null); }} />
        {results.length > 0 && (
          <div className="mt-2 border border-border rounded-lg divide-y divide-border">
            {results.map((c) => (
              <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50">
                {c.customer_code} · {c.full_name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedCustomer && balance && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">{selectedCustomer.full_name}</h3>
            <Button size="sm" onClick={() => setTxnModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Giao dịch mới
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Số dư</p>
              <p className="text-2xl font-bold text-foreground mt-1">{balance.balance}</p>
            </div>
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Tích lũy</p><p className="text-foreground font-medium mt-1">{balance.earnedTotal}</p></div>
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Điều chỉnh</p><p className="text-foreground font-medium mt-1">{balance.adjustedTotal}</p></div>
            <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Hết hạn</p><p className="text-foreground font-medium mt-1">{balance.expiredTotal}</p></div>
          </div>
        </Card>
      )}

      <LoyaltyTransactionFormModal
        open={txnModalOpen}
        onClose={() => setTxnModalOpen(false)}
        initialCustomerId={selectedCustomer?.id}
        onSave={async (input) => {
          const staff = await getCurrentStaff();
          await recordTransaction({ ...input, createdBy: staff?.id ?? null });
          setTxnModalOpen(false);
          if (selectedCustomer) setBalance(await getCustomerBalance(selectedCustomer.id));
        }}
      />
    </div>
  );
}

function TransactionsTab() {
  const [rows, setRows] = useState<MarketingLoyaltyTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"All" | "Earn" | "Adjust" | "Expire">("All");
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setIsLoading(true);
    const result = await getTransactionsPage({ transactionType: typeFilter, page });
    setRows(result.rows);
    setTotalCount(result.totalCount);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, [page, typeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <Select
          options={[{ value: "All", label: "Tất cả loại" }, { value: "Earn", label: "Tích điểm" }, { value: "Adjust", label: "Điều chỉnh" }, { value: "Expire", label: "Hết hạn" }]}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="w-44"
        />
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Giao dịch mới
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin text-2xl">⟳</div></div>
      ) : rows.length === 0 ? (
        <Card className="text-center py-12 text-muted-foreground text-sm">Chưa có giao dịch nào</Card>
      ) : (
        <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Khách hàng</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Loại</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Điểm</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quy tắc</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ghi chú</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ngày</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((txn) => (
                <tr key={txn.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-sm text-foreground">{txn.customer?.full_name || "—"}</td>
                  <td className="px-5 py-3"><LoyaltyTxnTypeBadge type={txn.transaction_type} /></td>
                  <td className={`px-5 py-3 text-sm font-medium ${txn.points >= 0 ? "text-emerald-600" : "text-red-600"}`}>{txn.points >= 0 ? `+${txn.points}` : txn.points}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{txn.rule?.name || "—"}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{txn.note || "—"}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{formatDate(txn.created_at!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MarketingPagination page={page} totalCount={totalCount} onPageChange={setPage} />

      <LoyaltyTransactionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={async (input) => {
          const staff = await getCurrentStaff();
          await recordTransaction({ ...input, createdBy: staff?.id ?? null });
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
