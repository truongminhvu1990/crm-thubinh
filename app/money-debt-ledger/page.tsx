"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, RefreshCw, Plus, ArrowLeftRight, Link2, X, Landmark } from "lucide-react";
import { MoneyDebtLedgerEntry, MoneyDebtLedgerBalance } from "@/types/moneyDebtLedger";
import { MONEY_DEBT_LEDGER_ALL_TYPE_OPTIONS, MONEY_DEBT_LEDGER_CURRENCY_OPTIONS } from "@/lib/moneyDebtLedger/moneyDebtLedger.constants";
import MoneyDebtLedgerTable from "@/components/moneyDebtLedger/MoneyDebtLedgerTable";
import MoneyChangerBalanceTable from "@/components/moneyDebtLedger/MoneyChangerBalanceTable";
import MoneyChangerDetailPanel from "@/components/moneyDebtLedger/MoneyChangerDetailPanel";
import BalanceSummaryCards from "@/components/moneyDebtLedger/BalanceSummaryCards";
import TransactionDetailModal from "@/components/moneyDebtLedger/TransactionDetailModal";
import RecordMovementModal from "@/components/moneyDebtLedger/RecordMovementModal";
import BuyCnyModal from "@/components/moneyDebtLedger/BuyCnyModal";
import TechHReconcileModal from "@/components/moneyDebtLedger/TechHReconcileModal";
import SupplierPaymentViaMoneyChangerModal from "@/components/moneyDebtLedger/SupplierPaymentViaMoneyChangerModal";
import CorrectionModal from "@/components/moneyDebtLedger/CorrectionModal";
import Button from "@/components/ui/Button";
import SearchInput from "@/components/ui/SearchInput";
import SearchToolbar from "@/components/ui/SearchToolbar";

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const cny = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

interface Counterparty {
  id: string;
  name: string;
  partner_type: string;
}

interface BalanceRow extends MoneyDebtLedgerBalance {
  party: { id: string; name: string; partner_type: string } | null;
}

/** Stage 20 (Money & Debt Ledger UI/Reporting refactor) — a real công nợ
 * management screen: Money Changer balance summary first (Phase B/P), a
 * proper transaction table (never one card per row), drill-down by Money
 * Changer, and richer filters/search/detail — all built on the exact same
 * read APIs and write flows already proven in Stage 19A/19B/19C. Nothing
 * in this file calls a write RPC directly or duplicates a balance/
 * validation rule — every number and every write still goes through
 * lib/moneyDebtLedger/moneyDebtLedger.service.ts and its existing API
 * routes, unchanged. */
export default function MoneyDebtLedgerPage() {
  const [entries, setEntries] = useState<MoneyDebtLedgerEntry[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [partyFilter, setPartyFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeModal, setActiveModal] = useState<"movement" | "buy-cny" | "tech-h" | "supplier-payment-via-money-changer" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<MoneyDebtLedgerEntry | null>(null);
  const [detailEntry, setDetailEntry] = useState<MoneyDebtLedgerEntry | null>(null);

  const hasActiveFilters =
    searchTerm !== "" ||
    partyFilter !== "ALL" ||
    currencyFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    directionFilter !== "ALL" ||
    dateFrom !== "" ||
    dateTo !== "";

  async function loadEntries() {
    setIsLoading(true);
    setLoadError(null);
    setPermissionDenied(false);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (partyFilter !== "ALL") params.set("partyId", partyFilter);
      if (currencyFilter !== "ALL") params.set("currency", currencyFilter);
      if (typeFilter !== "ALL") params.set("transactionType", typeFilter);
      if (directionFilter !== "ALL") params.set("direction", directionFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const [entriesRes, balancesRes, partiesRes] = await Promise.all([
        fetch(`/api/money-debt-ledger?${params.toString()}`),
        fetch("/api/money-debt-ledger/balance"),
        fetch("/api/money-debt-ledger/counterparties"),
      ]);
      if (entriesRes.status === 403) {
        setPermissionDenied(true);
        setEntries([]);
        return;
      }
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
  }, [searchTerm, partyFilter, currencyFilter, typeFilter, directionFilter, dateFrom, dateTo]);

  function handleClearFilters() {
    setSearchTerm("");
    setPartyFilter("ALL");
    setCurrencyFilter("ALL");
    setTypeFilter("ALL");
    setDirectionFilter("ALL");
    setDateFrom("");
    setDateTo("");
  }

  function handleModalSaved() {
    setActiveModal(null);
    loadEntries();
  }

  function handleCorrectionSaved() {
    setCorrectionTarget(null);
    loadEntries();
  }

  function handleSelectMoneyChanger(partyId: string | null) {
    setPartyFilter(partyId ?? "ALL");
  }

  const partyOptions = [{ value: "ALL", label: "Tất cả đối tác" }, ...counterparties.map((p) => ({ value: p.id, label: p.name }))];
  const typeOptions = [{ value: "ALL", label: "Tất cả loại" }, ...MONEY_DEBT_LEDGER_ALL_TYPE_OPTIONS];
  const currencyOptions = [{ value: "ALL", label: "Tất cả tiền tệ" }, ...MONEY_DEBT_LEDGER_CURRENCY_OPTIONS];
  const directionOptions = [
    { value: "ALL", label: "Tất cả chiều" },
    { value: "IN", label: "Chỉ tiền vào (IN)" },
    { value: "OUT", label: "Chỉ tiền ra (OUT)" },
  ];

  // Header KPIs (Phase A) — derived purely from balances already fetched
  // above (getAllBalances(), unchanged business logic), never a second
  // aggregate request.
  const moneyChangerIds = new Set(balances.filter((b) => b.party?.partner_type === "Money Changer").map((b) => b.party_id));
  const totalMoneyChangerVnd = balances
    .filter((b) => b.party?.partner_type === "Money Changer" && b.currency === "VND")
    .reduce((sum, b) => sum + b.balance, 0);
  const cnyRows = balances.filter((b) => b.currency === "CNY");
  const totalCny = cnyRows.reduce((sum, b) => sum + b.balance, 0);

  const selectedMoneyChangerId = counterparties.find((p) => p.id === partyFilter && p.partner_type === "Money Changer")?.id ?? null;

  return (
    <div className="pb-8">
      {/* A. Header */}
      <div className="mb-4">
        <div className="flex items-start sm:items-end justify-between flex-wrap gap-4 mb-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <ArrowRightLeft className="w-6 h-6 text-primary" />
              Money &amp; Debt Ledger
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1.5">
              <span>{entries.length} giao dịch</span>
              <span>{moneyChangerIds.size} Money Changer</span>
              <span>
                Tổng VND: <span className="font-medium text-foreground">{vnd.format(totalMoneyChangerVnd)}</span>
              </span>
              {cnyRows.length > 0 && (
                <span>
                  Tổng CNY: <span className={`font-medium ${totalCny < 0 ? "text-destructive" : "text-foreground"}`}>¥{cny.format(totalCny)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="tech-h-reconcile-button" variant="secondary" size="sm" onClick={() => setActiveModal("tech-h")}>
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">Đối soát Money/Debt</span>
            </Button>
            <Button data-testid="buy-cny-button" variant="secondary" size="sm" onClick={() => setActiveModal("buy-cny")}>
              <ArrowLeftRight className="w-4 h-4" />
              <span className="hidden sm:inline">Mua CNY</span>
            </Button>
            <Button
              data-testid="supplier-payment-via-money-changer-button"
              variant="secondary"
              size="sm"
              onClick={() => setActiveModal("supplier-payment-via-money-changer")}
            >
              <Landmark className="w-4 h-4" />
              <span className="hidden sm:inline">TT nhà cung cấp qua MC</span>
            </Button>
            <Button data-testid="record-movement-button" variant="primary" size="sm" onClick={() => setActiveModal("movement")}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Ghi nhận giao dịch</span>
            </Button>
          </div>
        </div>
      </div>

      {permissionDenied && (
        <div className="mb-4 rounded-lg bg-amber-100 text-amber-800 text-sm px-4 py-3">
          Bạn không có quyền xem Money &amp; Debt Ledger (money_debt_ledger.view).
        </div>
      )}
      {loadError && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{loadError}</div>}

      {!permissionDenied && (
        <>
          {/* B. Money Changer balance summary — the most important section */}
          <MoneyChangerBalanceTable balances={balances} selectedPartyId={selectedMoneyChangerId} onSelect={handleSelectMoneyChanger} />

          {/* C. Drill-down detail for the selected Money Changer */}
          {selectedMoneyChangerId && (
            <MoneyChangerDetailPanel partyId={selectedMoneyChangerId} balances={balances} onClear={() => setPartyFilter("ALL")} />
          )}

          <BalanceSummaryCards balances={balances} />

          {/* F. Filters */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-4 mb-6">
            <SearchToolbar
              search={
                <SearchInput
                  data-testid="money-debt-ledger-search-input"
                  placeholder="Tìm theo mã GD, order, khách hàng, đối tác, tham chiếu..."
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
                className="flex-1 sm:flex-none sm:w-32 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {currencyOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                data-testid="money-debt-ledger-direction-filter"
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {directionOptions.map((o) => (
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
              <input
                data-testid="money-debt-ledger-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label="Từ ngày"
              />
              <input
                data-testid="money-debt-ledger-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 sm:flex-none sm:w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label="Đến ngày"
              />

              {hasActiveFilters && (
                <Button data-testid="money-debt-ledger-clear-filters-button" variant="secondary" size="md" onClick={handleClearFilters}>
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Reset filter</span>
                </Button>
              )}
              <Button data-testid="money-debt-ledger-reload-button" variant="secondary" size="md" onClick={loadEntries}>
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Làm mới</span>
              </Button>
            </SearchToolbar>
          </div>

          {/* D. Transaction ledger table */}
          <MoneyDebtLedgerTable entries={entries} isLoading={isLoading} onEdit={setCorrectionTarget} onRowClick={setDetailEntry} />
        </>
      )}

      <RecordMovementModal open={activeModal === "movement"} onClose={() => setActiveModal(null)} onSaved={handleModalSaved} />
      <BuyCnyModal open={activeModal === "buy-cny"} onClose={() => setActiveModal(null)} onSaved={handleModalSaved} />
      <TechHReconcileModal open={activeModal === "tech-h"} onClose={() => setActiveModal(null)} onSaved={handleModalSaved} />
      <SupplierPaymentViaMoneyChangerModal
        open={activeModal === "supplier-payment-via-money-changer"}
        onClose={() => setActiveModal(null)}
        onSaved={handleModalSaved}
        balances={balances}
      />
      <CorrectionModal entry={correctionTarget} onClose={() => setCorrectionTarget(null)} onSaved={handleCorrectionSaved} />
      <TransactionDetailModal
        entry={detailEntry}
        allEntries={entries}
        onClose={() => setDetailEntry(null)}
        onEdit={(e) => setCorrectionTarget(e)}
      />
    </div>
  );
}
