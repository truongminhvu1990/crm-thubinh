import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  MoneyDebtLedgerEntry,
  MoneyDebtLedgerBalance,
  MoneyDebtLedgerCurrency,
  CreateMoneyDebtLedgerEntryInput,
  CreateBuyCnyLedgerTransactionInput,
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
  "*, party:partners(id, name, partner_code, partner_type), payment:payments(id, amount, payment_method), order:orders(id, order_number)";

export interface LedgerListFilters {
  searchTerm?: string;
  partyId?: string;
  currency?: string;
  transactionType?: string;
}

export async function getLedgerEntries(
  filters: LedgerListFilters = {},
  client: SupabaseClient = supabase
): Promise<MoneyDebtLedgerEntry[]> {
  let query = client.from("money_debt_ledger_entries").select(WITH_JOINS);
  if (filters.partyId) query = query.eq("party_id", filters.partyId);
  if (filters.currency) query = query.eq("currency", filters.currency);
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching money/debt ledger entries:", error);
    return [];
  }

  let rows = data as unknown as MoneyDebtLedgerEntry[];
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (e) =>
        e.entry_code.toLowerCase().includes(term) ||
        e.party?.name?.toLowerCase().includes(term) ||
        e.reference?.toLowerCase().includes(term) ||
        e.transaction_group?.toLowerCase().includes(term)
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
