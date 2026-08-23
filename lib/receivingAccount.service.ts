import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ReceivingAccount, CreateReceivingAccountInput, UpdateReceivingAccountInput } from "@/types/receivingAccount";
import { logActivity } from "@/lib/activityLog.service";

/** Receiving Account (Payment / Bank Account / Money-Debt domain redesign,
 * Stage 2) — foundation CRUD only. No delete: is_active=false is the only
 * supported way to retire an account (setReceivingAccountActive), matching
 * lib/masterData.service.ts's own is_active convention.
 *
 * Does NOT create Money & Debt Ledger entries, does NOT create/select a
 * ledger counterparty, does NOT reconcile any payment, and does NOT touch
 * payment_method — all explicitly out of this table's scope (see the
 * migration's own header comment). Bank category correctness
 * (master_data.category='bank') is enforced here, at the application
 * layer, on every write — deliberately not by a DB trigger. */

export class ReceivingAccountRuleViolationError extends Error {}

/** Dev fix (2026-08-17) — bank_id is a real UUID FK to master_data.id
 * (receiving_accounts.bank_id REFERENCES master_data(id)), never a plain
 * text `value` like other master-data-backed fields. A malformed bank_id
 * (e.g. a text value/code such as "vcb" reaching here instead of a UUID —
 * the exact bug this fix addresses, root-caused to the UI layer and fixed
 * there too) must never surface as Postgres's own raw 22P02 "invalid input
 * syntax for type uuid" — it's caught here and translated into the same
 * clean ReceivingAccountRuleViolationError shape every other rule
 * violation in this file already uses. This is a defense-in-depth check
 * (the UI can no longer produce this today), not a replacement for the UI
 * fix — any other caller of this service (a future API consumer, a script)
 * gets the same protection. */
async function assertBankCategory(bankId: string, client: SupabaseClient): Promise<void> {
  const { data, error } = await client.from("master_data").select("id, category, is_active").eq("id", bankId).maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "22P02") {
      throw new ReceivingAccountRuleViolationError(`bank_id không hợp lệ (không phải UUID): "${bankId}"`);
    }
    throw error;
  }
  if (!data) throw new ReceivingAccountRuleViolationError(`Bank ${bankId} không tồn tại`);
  if (data.category !== "bank") {
    throw new ReceivingAccountRuleViolationError(`master_data ${bankId} không thuộc category 'bank' (category hiện tại: ${data.category})`);
  }
  if (!data.is_active) {
    throw new ReceivingAccountRuleViolationError(`Ngân hàng ${bankId} hiện không hoạt động (is_active=false)`);
  }
}

async function assertOwnerPartnerExists(ownerPartnerId: string, client: SupabaseClient): Promise<void> {
  const { data, error } = await client.from("partners").select("id").eq("id", ownerPartnerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ReceivingAccountRuleViolationError(`Partner ${ownerPartnerId} không tồn tại`);
}

/** Stage 5 (Product Owner Locked Decisions, 2026-08-16), Phase 2 — the
 * referenced partner must exist AND its partner_type must be exactly
 * "Money Changer". Supplier is deliberately rejected here (Decision 8:
 * Money Changer only for this stage) — this is stricter than
 * assertOwnerPartnerExists, which accepts any partner. Never called for a
 * NULL money_changer_partner_id (clearing the association requires no
 * validation, per Decision 6). */
async function assertMoneyChangerPartner(partnerId: string, client: SupabaseClient): Promise<void> {
  const { data, error } = await client.from("partners").select("id, partner_type").eq("id", partnerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ReceivingAccountRuleViolationError(`Partner ${partnerId} không tồn tại`);
  if (data.partner_type !== "Money Changer") {
    throw new ReceivingAccountRuleViolationError(
      `Partner ${partnerId} không phải Money Changer (partner_type hiện tại: ${data.partner_type})`
    );
  }
}

export interface ReceivingAccountListFilters {
  ownerPartnerId?: string;
  bankId?: string;
  includeInactive?: boolean;
}

/** Active accounts by default — matches getMasterDataOptions' own
 * is_active-filtered default; pass includeInactive to see retired ones
 * too (e.g. for an admin list view). */
export async function getReceivingAccounts(
  filters: ReceivingAccountListFilters = {},
  client: SupabaseClient = supabase
): Promise<ReceivingAccount[]> {
  let query = client.from("receiving_accounts").select("*");

  if (!filters.includeInactive) query = query.eq("is_active", true);
  if (filters.ownerPartnerId) query = query.eq("owner_partner_id", filters.ownerPartnerId);
  if (filters.bankId) query = query.eq("bank_id", filters.bankId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching receiving accounts:", error);
    return [];
  }
  return data as ReceivingAccount[];
}

export interface ReceivingAccountOption {
  id: string;
  label: string;
}

/** Payment / Bank Account / Money-Debt domain redesign, Stage 3 — the
 * display-ready, active-only option list for the Add Payment modal's
 * Receiving Account picker. "Bank — Owner — Currency — ****Account",
 * matching the locked design's own display examples. Separate from
 * getReceivingAccounts (raw rows, used by the management page's own list)
 * since this one always joins bank/owner for display and never returns
 * inactive accounts. */
export async function getReceivingAccountOptions(client: SupabaseClient = supabase): Promise<ReceivingAccountOption[]> {
  const { data, error } = await client
    .from("receiving_accounts")
    .select("id, currency, account_number, label, bank:master_data(value), owner:partners!receiving_accounts_owner_partner_id_fkey(name)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching receiving account options:", error);
    return [];
  }

  return (data as unknown as { id: string; currency: string; account_number: string; label: string | null; bank: { value: string } | null; owner: { name: string } | null }[]).map(
    (row) => ({
      id: row.id,
      label: `${row.bank?.value ?? "—"} — ${row.owner?.name ?? "—"} — ${row.currency} — ${row.account_number}${row.label ? ` (${row.label})` : ""}`,
    })
  );
}

export async function getReceivingAccountById(id: string, client: SupabaseClient = supabase): Promise<ReceivingAccount | null> {
  const { data, error } = await client.from("receiving_accounts").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching receiving account:", error);
    return null;
  }
  return data as ReceivingAccount | null;
}

export async function createReceivingAccount(
  input: CreateReceivingAccountInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<ReceivingAccount> {
  await assertBankCategory(input.bank_id, client);
  await assertOwnerPartnerExists(input.owner_partner_id, client);
  if (input.money_changer_partner_id) await assertMoneyChangerPartner(input.money_changer_partner_id, client);

  const { data, error } = await client
    .from("receiving_accounts")
    .insert({
      bank_id: input.bank_id,
      owner_partner_id: input.owner_partner_id,
      currency: input.currency,
      account_number: input.account_number,
      label: input.label ?? null,
      money_changer_partner_id: input.money_changer_partner_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "receiving_account_created", entity: "receiving_account", entity_id: data.id }, client);
  return data as ReceivingAccount;
}

export async function updateReceivingAccount(
  id: string,
  changes: UpdateReceivingAccountInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<ReceivingAccount> {
  if (changes.bank_id) await assertBankCategory(changes.bank_id, client);
  if (changes.owner_partner_id) await assertOwnerPartnerExists(changes.owner_partner_id, client);
  // Stage 5 Phase 2 — only a non-null value is validated against
  // partner_type='Money Changer'; explicitly clearing back to NULL
  // ("money_changer_partner_id" in changes with a null value) needs no
  // validation at all (Decision 6: NULL is always a valid state).
  if (changes.money_changer_partner_id) await assertMoneyChangerPartner(changes.money_changer_partner_id, client);

  const { data, error } = await client.from("receiving_accounts").update(changes).eq("id", id).select().single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "receiving_account_updated", entity: "receiving_account", entity_id: id }, client);
  return data as ReceivingAccount;
}

/** The only supported way to retire an account — no delete operation
 * exists in this service, matching the approved design (is_active=false
 * instead of DELETE). */
export async function setReceivingAccountActive(
  id: string,
  isActive: boolean,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<ReceivingAccount> {
  const { data, error } = await client
    .from("receiving_accounts")
    .update({ is_active: isActive })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  await logActivity(
    {
      staff_id: actorStaffId,
      action: isActive ? "receiving_account_activated" : "receiving_account_deactivated",
      entity: "receiving_account",
      entity_id: id,
    },
    client
  );
  return data as ReceivingAccount;
}
