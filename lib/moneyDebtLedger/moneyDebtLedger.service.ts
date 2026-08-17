import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  MoneyDebtLedgerEntry,
  MoneyDebtLedgerBalance,
  MoneyDebtLedgerCurrency,
  CreateMoneyDebtLedgerEntryInput,
  CreateBuyCnyLedgerTransactionInput,
  CreateSupplierPaymentViaMoneyChangerInput,
  CreateMoneyDebtLedgerCorrectionInput,
  MoneyDebtReconciliationCandidate,
} from "@/types/moneyDebtLedger";
import { TECH_H_PAYMENT_METHODS } from "./moneyDebtLedger.constants";

/** Money & Debt Ledger (docs/19_MONEY_DEBT_LEDGER_SPEC.md, DRAFT Rev 1).
 * Every write in this file goes through one of the two SECURITY DEFINER
 * Postgres functions created by
 * supabase/migrations/2026081714_money_debt_ledger_module.sql, revised by
 * 2026081715_money_debt_ledger_execute_privilege_fix.sql
 * (create_money_debt_ledger_entry / create_buy_cny_ledger_transaction) —
 * this service never issues a direct INSERT/UPDATE/DELETE against
 * money_debt_ledger_entries, and no such function is exported here (D7:
 * immutable once created).
 *
 * 2026-08-16 EXECUTE-privilege fix: `authenticated` (the role a normal
 * session-bound client authenticates as) no longer has EXECUTE on either
 * write function — only `service_role` does. Callers of `createLedgerEntry`
 * / `createBuyCnyTransaction` MUST pass a `client` created by
 * lib/supabase/admin.ts's `createAdminClient()` (the project's existing
 * server-only, service_role pattern — already used by
 * lib/auth/createStaffWithAuth.ts), never the ordinary session client —
 * see the API routes for where that switch happens, gated by
 * requirePermission() beforehand as always. `staffId` is now sent to the
 * RPC as `p_staff_id`, since the DB function can no longer derive it from
 * a session (service_role calls carry no end-user JWT) — this is not a
 * reversion of the earlier "don't trust caller-supplied identity" fix: the
 * function is no longer reachable by anything except the trusted server
 * itself, so the caller providing this value is the server, not the
 * browser.
 *
 * 2026-08-16 audit fix: this file no longer calls `logActivity()` after
 * either RPC — both DB functions already write their own `activity_logs`
 * row (correct actor, action, entity, entity_id, §24), so an app-layer
 * call after the fact was a pure duplicate, not a second source of
 * coverage. Matches Compensation Ledger's own precedent: a DB-function-
 * driven write logs itself once, authoritatively. Immutability itself is
 * enforced by a dedicated BEFORE UPDATE/DELETE/TRUNCATE trigger
 * (2026081716_money_debt_ledger_immutability_guard.sql), not RLS alone —
 * RLS does not bind service_role/the table owner, the trigger does. */

export class MoneyDebtLedgerRuleViolationError extends Error {}

const WITH_JOINS =
  "*, party:partners(id, name, partner_code, partner_type), payment:payments(id, amount, payment_method, receiving_account:receiving_accounts(id, account_number, label, bank:master_data(value))), order:orders(id, order_number, customer:customers(id, full_name)), created_by_staff:staff(id, full_name)";

/** Stage (Money/Debt Ledger reporting — column config + relation links) —
 * a paired transaction ('Supplier Payment via Money Changer', 'Buy CNY')
 * produces 2 rows sharing one transaction_group, each with its own party.
 * The row for one leg doesn't carry the OTHER leg's party on itself (e.g.
 * the Money Changer's VND OUT row has no direct reference to the Supplier
 * it paid) — that relationship only exists via transaction_group, the same
 * relationship the DB functions themselves already establish (§Phase 4:
 * "party / transaction_group / linked transaction", no new column, no
 * duplicated Supplier data). This does one extra read query (only when the
 * current page actually has grouped rows) and mutates `rows` in place by
 * attaching each row's sibling party as `group_counterparty` — additive,
 * read-only, never touches a write path. */
async function attachGroupCounterparties(rows: MoneyDebtLedgerEntry[], client: SupabaseClient): Promise<void> {
  const groups = [...new Set(rows.map((r) => r.transaction_group).filter((g): g is string => !!g))];
  if (groups.length === 0) return;

  const { data, error } = await client
    .from("money_debt_ledger_entries")
    .select("id, transaction_group, party_id, party:partners(id, name, partner_code, partner_type)")
    .in("transaction_group", groups);
  if (error || !data) {
    console.error("Error resolving transaction_group counterparties:", error);
    return;
  }

  const byGroup = new Map<string, { id: string; party_id: string; party: MoneyDebtLedgerEntry["party"] }[]>();
  for (const row of data as unknown as { id: string; transaction_group: string; party_id: string; party: MoneyDebtLedgerEntry["party"] }[]) {
    const list = byGroup.get(row.transaction_group) ?? [];
    list.push(row);
    byGroup.set(row.transaction_group, list);
  }

  for (const entry of rows) {
    if (!entry.transaction_group) continue;
    const siblings = byGroup.get(entry.transaction_group) ?? [];
    const counterpart = siblings.find((s) => s.party_id !== entry.party_id);
    entry.group_counterparty = counterpart?.party ?? null;
  }
}

export interface LedgerListFilters {
  searchTerm?: string;
  partyId?: string;
  currency?: string;
  transactionType?: string;
  /** Stage 20 (UI/Reporting refactor) — pure read-query additions, same
   * shape/precedent as the filters above. No new business logic, no new
   * write path, no new table. */
  direction?: "IN" | "OUT";
  dateFrom?: string;
  dateTo?: string;
}

export async function getLedgerEntries(
  filters: LedgerListFilters = {},
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerEntry[]> {
  let query = client.from("money_debt_ledger_entries").select(WITH_JOINS);
  if (filters.partyId) query = query.eq("party_id", filters.partyId);
  if (filters.currency) query = query.eq("currency", filters.currency);
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.dateFrom) query = query.gte("transaction_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("transaction_date", filters.dateTo);

  const { data, error } = await query.order("transaction_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching money/debt ledger entries:", error);
    return [];
  }

  let rows = data as unknown as MoneyDebtLedgerEntry[];
  await attachGroupCounterparties(rows, client);

  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (e) =>
        e.entry_code.toLowerCase().includes(term) ||
        e.party?.name?.toLowerCase().includes(term) ||
        e.group_counterparty?.name?.toLowerCase().includes(term) ||
        e.reference?.toLowerCase().includes(term) ||
        e.transaction_group?.toLowerCase().includes(term) ||
        e.order?.order_number?.toLowerCase().includes(term) ||
        e.order?.customer?.full_name?.toLowerCase().includes(term) ||
        e.payment?.payment_method?.toLowerCase().includes(term)
    );
  }
  return rows;
}

/** §19 — Balance(party, currency) = Σ IN − Σ OUT, computed live, never
 * stored (D5/D8). Deliberately fetches only `amount`/`direction` rather
 * than every column — this is a pure aggregation, same shape as Loyalty's
 * own sumPointsForCustomer (lib/marketing/loyalty.repository.ts). */
export async function getBalance(
  partyId: string,
  currency: MoneyDebtLedgerCurrency,
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerBalance> {
  const { data, error } = await client
    .from("money_debt_ledger_entries")
    .select("amount, direction")
    .eq("party_id", partyId)
    .eq("currency", currency);

  if (error) {
    console.error("Error computing money/debt ledger balance:", error);
    return { party_id: partyId, currency, total_in: 0, total_out: 0, balance: 0 };
  }

  const rows = (data ?? []) as { amount: number; direction: "IN" | "OUT" }[];
  const total_in = rows.filter((r) => r.direction === "IN").reduce((sum, r) => sum + r.amount, 0);
  const total_out = rows.filter((r) => r.direction === "OUT").reduce((sum, r) => sum + r.amount, 0);

  return { party_id: partyId, currency, total_in, total_out, balance: total_in - total_out };
}

/** Every (party, currency) pair that has at least one ledger row — the
 * source list for the Balances view (Phase 7/9). CNY is never converted
 * into VND here or anywhere else (D5, §22). */
export async function getAllBalances(client: SupabaseClient = supabase): Promise<MoneyDebtLedgerBalance[]> {
  const { data, error } = await client.from("money_debt_ledger_entries").select("party_id, currency, amount, direction");
  if (error) {
    console.error("Error computing money/debt ledger balances:", error);
    return [];
  }

  const rows = (data ?? []) as { party_id: string; currency: MoneyDebtLedgerCurrency; amount: number; direction: "IN" | "OUT" }[];
  const groups = new Map<string, MoneyDebtLedgerBalance>();
  for (const row of rows) {
    const key = `${row.party_id}::${row.currency}`;
    const group = groups.get(key) ?? { party_id: row.party_id, currency: row.currency, total_in: 0, total_out: 0, balance: 0 };
    if (row.direction === "IN") group.total_in += row.amount;
    else group.total_out += row.amount;
    group.balance = group.total_in - group.total_out;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Money Changer/Supplier partners eligible as a ledger counterparty
 * (§6/D2) — Terminated partners are excluded since a terminated
 * relationship shouldn't receive new movements (existing ones remain
 * untouched, per money_debt_ledger's own RESTRICT-not-CASCADE FK, §26). */
export async function getLedgerCounterparties(client: SupabaseClient = supabase) {
  const { data, error } = await client
    .from("partners")
    .select("id, name, partner_code, partner_type, status")
    .in("partner_type", ["Money Changer", "Supplier"])
    .neq("status", "Terminated")
    .order("name");
  if (error) {
    console.error("Error fetching Money Changer/Supplier partners:", error);
    return [];
  }
  return data ?? [];
}

/** TECH_H payments with an outstanding (not-yet-fully-reconciled) amount —
 * the picker data source for the TECH_H Reconciliation flow (Phase 5/9).
 * "Fully reconciled" = Σ linked 'Customer Payment TECH_H' ledger rows for
 * that Payment equals the Payment's own amount, matching the same guard
 * enforced server-side in create_money_debt_ledger_entry().
 *
 * 2026-08-16 fix: matches TECH_H_PAYMENT_METHODS (the explicit, narrow set
 * of real historical `payments.payment_method` spellings — "Tech_H"/
 * "TechH"), not the literal "TECH_H", which has zero historical Production
 * payments (payment_method has no FK to master_data, so a "TECH_H"
 * master-data option — which does not and will not exist per Product Owner
 * decision — would never have retroactively matched existing rows anyway).
 * See moneyDebtLedger.constants.ts's own doc comment for the full
 * Production-data reasoning. */
export async function getTechHReconciliationCandidates(client: SupabaseClient = supabase) {
  const { data: payments, error: paymentsError } = await client
    .from("payments")
    .select("id, amount, payment_date, order_id, order:orders(id, order_number, customer:customers(id, full_name))")
    .in("payment_method", TECH_H_PAYMENT_METHODS)
    .order("payment_date", { ascending: false });
  if (paymentsError) {
    console.error("Error fetching TECH_H payments:", paymentsError);
    return [];
  }

  const { data: reconciled, error: reconciledError } = await client
    .from("money_debt_ledger_entries")
    .select("linked_payment_id, amount")
    .eq("transaction_type", "Customer Payment TECH_H");
  if (reconciledError) {
    console.error("Error fetching existing TECH_H reconciliations:", reconciledError);
    return [];
  }

  const reconciledByPayment = new Map<string, number>();
  for (const row of (reconciled ?? []) as { linked_payment_id: string; amount: number }[]) {
    reconciledByPayment.set(row.linked_payment_id, (reconciledByPayment.get(row.linked_payment_id) ?? 0) + row.amount);
  }

  return (payments ?? [])
    .map((p) => {
      const payment = p as unknown as { id: string; amount: number; payment_date: string; order_id: string; order: unknown };
      const alreadyReconciled = reconciledByPayment.get(payment.id) ?? 0;
      return { ...payment, already_reconciled: alreadyReconciled, remaining: payment.amount - alreadyReconciled };
    })
    .filter((p) => p.remaining > 0);
}

interface RawReceivingAccountCandidateRow {
  id: string;
  amount: number;
  payment_date: string;
  order_id: string;
  payment_method: string;
  receiving_account_id: string;
  order: { id: string; order_number: string; customer: { id: string; full_name: string } | null } | null;
  receiving_account: {
    id: string;
    currency: string;
    account_number: string;
    label: string | null;
    money_changer_partner_id: string | null;
    bank: { value: string } | null;
    owner: { name: string } | null;
    money_changer: { name: string } | null;
  } | null;
}

/** Stage 5 (Product Owner Locked Decisions, 2026-08-16), Phase 4 — the
 * SECOND, generic reconciliation-candidate path, additive to (never
 * replacing) getTechHReconciliationCandidates above. A payment qualifies
 * when it has a Receiving Account AND that Receiving Account has an
 * explicit Money Changer association (receiving_accounts.
 * money_changer_partner_id IS NOT NULL) AND it isn't yet fully reconciled —
 * exactly Phase 4's "receiving_account_money_changer_candidate" clause, no
 * payment_method string matching involved at all (deliberately not
 * "contains Tech", not case-insensitive, not bank/owner-name-based — Phase
 * 4's own explicit prohibitions). The money_changer_partner_id IS NOT NULL
 * filter is applied in JS rather than as a DB-level embedded-resource
 * filter (`!inner` + `.not()` on the joined column) — both are equivalent
 * in effect; JS filtering was chosen to keep the query shape simple and
 * directly testable against this file's own fake `from()` client, matching
 * getTechHReconciliationCandidates' own existing style. */
export async function getReceivingAccountReconciliationCandidates(
  client: SupabaseClient = supabase
): Promise<MoneyDebtReconciliationCandidate[]> {
  const { data: payments, error: paymentsError } = await client
    .from("payments")
    .select(
      "id, amount, payment_date, order_id, payment_method, receiving_account_id, " +
        "order:orders(id, order_number, customer:customers(id, full_name)), " +
        "receiving_account:receiving_accounts(id, currency, account_number, label, money_changer_partner_id, " +
        "bank:master_data(value), owner:partners!receiving_accounts_owner_partner_id_fkey(name), " +
        "money_changer:partners!receiving_accounts_money_changer_partner_id_fkey(name))"
    )
    .not("receiving_account_id", "is", null)
    .order("payment_date", { ascending: false });
  if (paymentsError) {
    console.error("Error fetching Receiving-Account-linked payments:", paymentsError);
    return [];
  }

  const { data: reconciled, error: reconciledError } = await client
    .from("money_debt_ledger_entries")
    .select("linked_payment_id, amount")
    .eq("transaction_type", "Customer Payment TECH_H");
  if (reconciledError) {
    console.error("Error fetching existing reconciliations:", reconciledError);
    return [];
  }

  const reconciledByPayment = new Map<string, number>();
  for (const row of (reconciled ?? []) as { linked_payment_id: string; amount: number }[]) {
    reconciledByPayment.set(row.linked_payment_id, (reconciledByPayment.get(row.linked_payment_id) ?? 0) + row.amount);
  }

  return ((payments ?? []) as unknown as RawReceivingAccountCandidateRow[])
    .filter((p) => p.receiving_account?.money_changer_partner_id != null)
    .map((p) => {
      const alreadyReconciled = reconciledByPayment.get(p.id) ?? 0;
      return {
        id: p.id,
        order_id: p.order_id,
        payment_method: p.payment_method,
        amount: p.amount,
        payment_date: p.payment_date,
        already_reconciled: alreadyReconciled,
        remaining: p.amount - alreadyReconciled,
        order: p.order,
        receiving_account_id: p.receiving_account_id,
        bank: p.receiving_account?.bank?.value ?? null,
        account_owner: p.receiving_account?.owner?.name ?? null,
        account_currency: p.receiving_account?.currency ?? null,
        account_label: p.receiving_account?.label ?? null,
        account_number: p.receiving_account?.account_number ?? null,
        money_changer_partner_id: p.receiving_account?.money_changer_partner_id ?? null,
        money_changer_name: p.receiving_account?.money_changer?.name ?? null,
      };
    })
    .filter((p) => p.remaining > 0);
}

/** Stage 5, Phase 4/5 — the unified candidate list: historical TECH_H/
 * TechH (unchanged, payment_method-based) OR generic Receiving-Account +
 * Money-Changer-association candidates, merged into one response shape for
 * the reconciliation UI. Historical rows carry receiving_account_id=null,
 * money_changer_partner_id=null (Phase 5: "That is valid. Do not fabricate
 * receiving-account information."). Deduplicated by payment id defensively
 * — in practice the two source sets can never overlap, since a payment
 * only ever gets a receiving_account_id when payment_method is the
 * Bank-Transfer-shaped value (order.validation.ts), which is never one of
 * TECH_H_PAYMENT_METHODS. */
export async function getReconciliationCandidates(client: SupabaseClient = supabase): Promise<MoneyDebtReconciliationCandidate[]> {
  // Sequential, not Promise.all — keeps the two independent queries'
  // table-call ordering deterministic and simple to fake in tests
  // (each source function issues its own payments + money_debt_ledger_entries
  // query pair; interleaving them would make per-table call sequencing
  // ambiguous for no real performance benefit at this data volume).
  const techH = await getTechHReconciliationCandidates(client);
  const receivingAccountBased = await getReceivingAccountReconciliationCandidates(client);

  const techHCandidates: MoneyDebtReconciliationCandidate[] = (
    techH as { id: string; amount: number; payment_date: string; order_id: string; order: unknown; already_reconciled: number; remaining: number }[]
  ).map((p) => ({
    id: p.id,
    order_id: p.order_id,
    payment_method: "", // not selected by getTechHReconciliationCandidates' own query — irrelevant to its historical alias-based detection
    amount: p.amount,
    payment_date: p.payment_date,
    already_reconciled: p.already_reconciled,
    remaining: p.remaining,
    order: p.order as MoneyDebtReconciliationCandidate["order"],
    receiving_account_id: null,
    bank: null,
    account_owner: null,
    account_currency: null,
    account_label: null,
    account_number: null,
    money_changer_partner_id: null,
    money_changer_name: null,
  }));

  const seen = new Set<string>();
  const merged: MoneyDebtReconciliationCandidate[] = [];
  for (const candidate of [...techHCandidates, ...receivingAccountBased]) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    merged.push(candidate);
  }
  return merged.sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1));
}

/** Supabase's own RPC error (PostgrestError) is a plain object, not
 * necessarily an `Error` instance — an `instanceof Error` check alone
 * silently discarded the actual Postgres message (including the DB's own
 * "Forbidden: money_debt_ledger.create permission required" rejection from
 * the 2026-08-16 security fix) and replaced it with a generic fallback,
 * caught by this file's own SECURITY (C) test. Read `.message` off any
 * error-shaped object, not just true Error instances. */
function toRuleViolation(error: unknown): MoneyDebtLedgerRuleViolationError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Không thể ghi nhận giao dịch";
  return new MoneyDebtLedgerRuleViolationError(message);
}

/** Single-row write path — every transaction_type except 'Buy CNY'. Calls
 * create_money_debt_ledger_entry() (SECURITY DEFINER, the table's own RLS
 * grants no direct INSERT to anon/authenticated — see the migration) so
 * this is the only way this service can ever add a row for these types. */
export async function createLedgerEntry(
  input: CreateMoneyDebtLedgerEntryInput,
  staffId: string | null,
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerEntry> {
  if (input.amount <= 0) throw new MoneyDebtLedgerRuleViolationError("Số tiền phải lớn hơn 0");
  if (!input.party_id) throw new MoneyDebtLedgerRuleViolationError("Vui lòng chọn đối tác (Money Changer/Supplier)");
  if (!staffId) throw new MoneyDebtLedgerRuleViolationError("Không xác định được nhân viên thực hiện giao dịch");

  const { data, error } = await client.rpc("create_money_debt_ledger_entry", {
    p_staff_id: staffId,
    p_transaction_type: input.transaction_type,
    p_party_id: input.party_id,
    p_party_type: input.party_type,
    p_currency: input.currency,
    p_amount: input.amount,
    p_direction: input.direction ?? null,
    p_transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
    p_linked_payment_id: input.linked_payment_id ?? null,
    p_linked_order_id: input.linked_order_id ?? null,
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw toRuleViolation(error);

  // No logActivity() call here (2026-08-16 double-audit-entry fix) —
  // create_money_debt_ledger_entry() already writes its own activity_logs
  // row, with the same session-verified p_staff_id, action, entity, and
  // entity_id this call would have duplicated. Matches Compensation
  // Ledger's own precedent: a DB-function-driven write logs itself once,
  // authoritatively — the application layer doesn't also log it.
  return data as MoneyDebtLedgerEntry;
}

/** Paired write path (D4) — always produces exactly 2 rows sharing one
 * transaction_group, created atomically inside
 * create_buy_cny_ledger_transaction() (see the migration for why a single
 * Postgres function call guarantees this). */
export async function createBuyCnyTransaction(
  input: CreateBuyCnyLedgerTransactionInput,
  staffId: string | null,
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerEntry[]> {
  if (input.vnd_amount <= 0 || input.cny_amount <= 0) {
    throw new MoneyDebtLedgerRuleViolationError("Số tiền VND và CNY phải lớn hơn 0");
  }
  if (input.fx_rate <= 0) throw new MoneyDebtLedgerRuleViolationError("Tỷ giá phải lớn hơn 0");
  if (!input.party_id) throw new MoneyDebtLedgerRuleViolationError("Vui lòng chọn đơn vị đổi tiền (Money Changer)");
  if (!staffId) throw new MoneyDebtLedgerRuleViolationError("Không xác định được nhân viên thực hiện giao dịch");

  const { data, error } = await client.rpc("create_buy_cny_ledger_transaction", {
    p_staff_id: staffId,
    p_party_id: input.party_id,
    p_vnd_amount: input.vnd_amount,
    p_cny_amount: input.cny_amount,
    p_fx_rate: input.fx_rate,
    p_transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw toRuleViolation(error);

  // No logActivity() loop here — same reasoning as createLedgerEntry above:
  // create_buy_cny_ledger_transaction() already writes one activity_logs
  // row per leg itself.
  return data as MoneyDebtLedgerEntry[];
}

/** Stage 19 (Product Owner Locked Business Contract, 2026-08-17) — the
 * standalone, idempotent Payment -> Money/Debt Ledger sync entry point.
 * Wraps sync_payment_to_money_debt_ledger()
 * (supabase/migrations/2026081721_money_debt_ledger_automatic_sync.sql),
 * which itself calls the existing, unmodified
 * create_money_debt_ledger_entry() — never a direct INSERT into
 * money_debt_ledger_entries. Returns `null` (not an error) when the
 * payment simply isn't eligible (no receiving account, or the receiving
 * account has no Money Changer association) — that is Phase 12
 * scenario C's own expected, valid outcome, not a failure. Safe to call
 * repeatedly for the same paymentId (Phase 13/14): the DB function's own
 * SELECT-then-insert-with-unique-index-backstop guarantees at most one
 * 'Customer Payment via Money Changer' row per payment even under
 * concurrent invocation — this wrapper adds no additional
 * application-level duplicate check of its own, since one would not be
 * race-safe and the DB-level guarantee is already authoritative. */
export async function syncPaymentToMoneyDebtLedger(
  paymentId: string,
  staffId: string,
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerEntry | null> {
  const { data, error } = await client.rpc("sync_payment_to_money_debt_ledger", {
    p_staff_id: staffId,
    p_payment_id: paymentId,
  });
  if (error) throw toRuleViolation(error);
  return (data as MoneyDebtLedgerEntry | null) ?? null;
}

/** Stage 19B — paired write path (same shape as createBuyCnyTransaction):
 * always produces exactly 2 rows sharing one transaction_group, created
 * atomically inside create_supplier_payment_via_money_changer(). The VND
 * amount is never sent by the caller — the DB function derives it from
 * cny_amount x fx_rate and rejects the call outright if the Money
 * Changer's current VND balance can't cover it (§ the migration's own doc
 * comment, Phase 11's "reject negative balance by default"). */
export async function createSupplierPaymentViaMoneyChanger(
  input: CreateSupplierPaymentViaMoneyChangerInput,
  staffId: string | null,
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerEntry[]> {
  if (input.cny_amount <= 0) throw new MoneyDebtLedgerRuleViolationError("Số tiền CNY phải lớn hơn 0");
  if (input.fx_rate <= 0) throw new MoneyDebtLedgerRuleViolationError("Tỷ giá phải lớn hơn 0");
  if (!input.money_changer_partner_id) throw new MoneyDebtLedgerRuleViolationError("Vui lòng chọn đơn vị đổi tiền (Money Changer)");
  if (!input.supplier_partner_id) throw new MoneyDebtLedgerRuleViolationError("Vui lòng chọn nhà cung cấp");
  if (!staffId) throw new MoneyDebtLedgerRuleViolationError("Không xác định được nhân viên thực hiện giao dịch");

  const { data, error } = await client.rpc("create_supplier_payment_via_money_changer", {
    p_staff_id: staffId,
    p_money_changer_partner_id: input.money_changer_partner_id,
    p_supplier_partner_id: input.supplier_partner_id,
    p_cny_amount: input.cny_amount,
    p_fx_rate: input.fx_rate,
    p_transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw toRuleViolation(error);
  return data as MoneyDebtLedgerEntry[];
}

/** Stage 19B — the sole "Edit voucher" mechanism. Never updates/deletes the
 * original row (D7, still enforced by the unconditional immutability
 * trigger) — always creates a new Adjustment row carrying the delta and a
 * corrects_entry_id back-reference, inheriting party/currency/linked_
 * payment_id/linked_order_id from the entry it corrects.
 * create_money_debt_ledger_correction() rejects the call if it would take
 * a Money Changer's balance negative — the same guard as
 * createSupplierPaymentViaMoneyChanger. */
export async function createMoneyDebtLedgerCorrection(
  input: CreateMoneyDebtLedgerCorrectionInput,
  staffId: string | null,
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerEntry> {
  if (input.amount <= 0) throw new MoneyDebtLedgerRuleViolationError("Số tiền điều chỉnh phải lớn hơn 0");
  if (!input.corrects_entry_id) throw new MoneyDebtLedgerRuleViolationError("Thiếu tham chiếu đến giao dịch cần sửa");
  if (!staffId) throw new MoneyDebtLedgerRuleViolationError("Không xác định được nhân viên thực hiện giao dịch");

  const { data, error } = await client.rpc("create_money_debt_ledger_correction", {
    p_staff_id: staffId,
    p_corrects_entry_id: input.corrects_entry_id,
    p_amount: input.amount,
    p_direction: input.direction,
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw toRuleViolation(error);
  return data as MoneyDebtLedgerEntry;
}
