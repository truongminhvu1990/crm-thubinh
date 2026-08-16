"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, RefreshCw, Plus, ArrowLeftRight, Link2, X } from "lucide-react";
import { MoneyDebtLedgerEntry, MoneyDebtLedgerBalance } from "@/types/moneyDebtLedger";
import { MONEY_DEBT_LEDGER_ALL_TYPE_OPTIONS, MONEY_DEBT_LEDGER_CURRENCY_OPTIONS } from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";
import MoneyDebtLedgerTable from "@/components/moneyDebtLedger/MoneyDebtLedgerTable";
import BalanceSummaryCards from "@/components/moneyDebtLedger/BalanceSummaryCards";
import RecordMovementModal from "@/components/moneyDebtLedger/RecordMovementModal";
import BuyCnyModal from "@/components/moneyDebtLedger/BuyCnyModal";
import TechHReconcileModal from "@/components/moneyDebtLedger/TechHReconcileModal";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import SearchToolbar from "@/components/ui/SearchToolbar";

interface Counterparty {
  id: string;
  name: string;
  partner_type: string;
}

interface BalanceRow extends MoneyDebtLedgerBalance {
  party: { id: string; name: string; partner_type: string } | null;
}

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §9/§27 — view, filter by party/
 * currency/transaction type, view balances, and record every one of the 8
 * transaction types via the 3 modals below. No edit/delete row action
 * anywhere on this page — ledger rows are immutable once created (D7). */
export default function MoneyDebtLedgerPage() {
  const [entries, setEntries] = useState<MoneyDebtLedgerEntry[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [partyFilter, setPartyFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [activeModal, setActiveModal] = useState<"movement" | "buy-cny" | "tech-h" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasActiveFilters = searchTerm !== "" || partyFilter !== "ALL" || currencyFilter !== "ALL" || typeFilter !== "ALL";

  async function loadEntries() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (partyFilter !== "ALL") params.set("partyId", partyFilter);
      if (currencyFilter !== "ALL") params.set("currency", currencyFilter);
      if (typeFilter !== "ALL") params.set("transactionType", typeFilter);

      const [entriesRes, balancesRes, partiesRes] = await Promise.all([
        fetch(`/api/money-debt-ledger?${params.toString()}`),
        fetch("/api/money-debt-ledger/balance"),
        fetch("/api/money-debt-ledger/counterparties"),
      ]);
      if (!entriesRes.ok) throw new Error("Không thể tải Money & Debt Ledger");
      setEntries(await entriesRes.json());
      setBalances(balancesRes.ok ? await balancesRes.json() : []);
      setCounterparties(partiesRes.ok ? await partiesRes.json() : []);
    } catch (error) {
      console.error("Failed to load Money & Debt Ledger:", error);
      setLoadError(error instanceof Error ? error.message : "Đã có lỗi xảy ra");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same fetch-on-filter-change pattern as app/compensation-ledger/page.tsx
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, partyFilter, currencyFilter, typeFilter]);

  function handleClearFilters() {
    setSearchTerm("");
    setPartyFilter("ALL");
    setCurrencyFilter("ALL");
    setTypeFilter("ALL");
  }

  function handleModalSaved() {
    setActiveModal(null);
    loadEntries();
  }

  const partyOptions = [{ value: "ALL", label: "Tất cả đối tác" }, ...counterparties.map((p) => ({ value: p.id, label: p.name }))];
  const typeOptions = [{ value: "ALL", label: "Tất cả loại" }, ...MONEY_DEBT_LEDGER_ALL_TYPE_OPTIONS];
  const currencyOptions = [{ value: "ALL", label: "Tất cả tiền tệ" }, ...MONEY_DEBT_LEDGER_CURRENCY_OPTIONS];

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-start sm:items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-primary" />
            Money &amp; Debt Ledger
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{entries.length} giao dịch</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="tech-h-reconcile-button" variant="secondary" size="md" onClick={() => setActiveModal("tech-h")}>
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Đối soát TECH_H</span>
          </Button>
          <Button data-testid="buy-cny-button" variant="secondary" size="md" onClick={() => setActiveModal("buy-cny")}>
            <ArrowLeftRight className="w-4 h-4" />
            <span className="hidden sm:inline">Mua CNY</span>
          </Button>
          <Button data-testid="record-movement-button" variant="primary" size="md" onClick={() => setActiveModal("movement")}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ghi nhận giao dịch</span>
          </Button>
        </div>
      </div>

      <BalanceSummaryCards balances={balances} />

      {loadError && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{loadError}</div>}

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
        <SearchToolbar
          search={
            <SearchInput
              data-testid="money-debt-ledger-search-input"
              placeholder="Tìm theo mã giao dịch, đối tác, tham chiếu..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm("")}
            />
          }
        >
          <select
            data-testid="money-debt-ledger-party-filter"
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-44 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {partyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            data-testid="money-debt-ledger-currency-filter"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-36 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {currencyOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            data-testid="money-debt-ledger-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 sm:flex-none sm:w-56 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button data-testid="money-debt-ledger-clear-filters-button" variant="secondary" size="md" onClick={handleClearFilters}>
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Xóa bộ lọc</span>
            </Button>
          )}
          <Button data-testid="money-debt-ledger-reload-button" variant="secondary" size="md" onClick={loadEntries}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
        </SearchToolbar>
      </div>

      <MoneyDebtLedgerTable entries={entries} isLoading={isLoading} />

      <RecordMovementModal open={activeModal === "movement"} onClose={() => setActiveModal(null)} onSaved={handleModalSaved} />
      <BuyCnyModal open={activeModal === "buy-cny"} onClose={() => setActiveModal(null)} onSaved={handleModalSaved} />
      <TechHReconcileModal open={activeModal === "tech-h"} onClose={() => setActiveModal(null)} onSaved={handleModalSaved} />
    </div>
  );
}
