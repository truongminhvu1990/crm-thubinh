import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Settlement, SettlementItem } from "@/types/settlement";
import { getCompensationById, handOffCompensation, CompensationRuleViolationError } from "@/lib/compensation/compensation.service";
import { logActivity } from "@/lib/activityLog.service";
import { createAdminClient } from "@/lib/supabase/admin";

/** Settlement (docs/14_SETTLEMENT_SPEC.md, LOCKED Rev 3). Settlement never
 * calculates or re-determines a Compensation amount — every function here
 * trusts each referenced Compensation's own Confirmed/Handed-Off
 * `calculated_amount` as final (§1, §8). No Compensation Ledger logic of
 * any kind — Completed is this module's own terminal state; there is no
 * living Ledger Subscriber to call (Compensation Ledger has zero code
 * anywhere), so "publishing a Business Event" here is honestly just
 * Settlement recording its own Completed status, nothing more.
 *
 * Relationship (Product Owner Revision, 2026-07-31, Decision 1): Settlement
 * 1:N Settlement Items N:1 Compensation — replaces the prior 1:1 design.
 *
 * Two-step flow (Decision 2: Settlement creation may only select
 * Compensation already Handed Off — Confirmed must never appear in that
 * selection list):
 *   1. handOffCompensations() — a Settlement-side batch action that moves
 *      selected Confirmed compensations to Handed Off, one at a time via
 *      Compensation's own handOffCompensation() function. This is its own
 *      separate step, not a side effect of Settlement creation (that was
 *      Rev 1's design; Decision 2 explicitly forbids it now).
 *   2. createSettlement() — bundles one or more already-Handed-Off,
 *      not-yet-settled compensations into a new Settlement Request.
 * Neither step touches any existing Compensation function, page, or
 * business rule — handOffCompensation() itself was added, standalone, to
 * lib/compensation/compensation.service.ts during the original Settlement
 * Implementation Task and is reused here unchanged. */

const ITEM_JOIN =
  "*, compensation:compensations(id, compensation_code, compensation_type, calculated_amount, status, order:orders(id, order_number), customer:customers(id, full_name))";
const WITH_JOINS = `*, partner:partners(id, name, partner_code, partner_type, status), items:settlement_items(${ITEM_JOIN}), receiving_account:receiving_accounts(id, account_number, currency, label)`;

function computeTotal(items: SettlementItem[]): number {
  return items.reduce((sum, item) => sum + (item.compensation?.calculated_amount ?? 0), 0);
}

function withComputedTotal(row: unknown): Settlement {
  const settlement = row as Settlement;
  return { ...settlement, total_amount: computeTotal(settlement.items ?? []) };
}

async function generateSettlementCode(client: SupabaseClient): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `SETT-${datePart}-`;

  const { data, error } = await client.from("settlements").select("id").like("settlement_code", `${prefix}%`);
  if (error) throw error;

  const sequence = (data?.length ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

export class SettlementRuleViolationError extends Error {}

/** Step 1's own picker data source — Confirmed compensations, regardless of
 * whether they've been bundled into a Settlement yet (that check applies
 * to Handed Off compensations, at Step 2, not here). */
export async function getConfirmedCompensationsForHandOff(client: SupabaseClient = supabase) {
  const { data, error } = await client
    .from("compensations")
    .select("id, compensation_code, compensation_type, calculated_amount, partner_id, partner:partners(id, name)")
    .eq("status", "Confirmed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Step 1 — Confirmed -> Handed Off, one or more at a time. Decision 2's
 * own precondition: only ever called against Confirmed compensations
 * (handOffCompensation itself already throws if not). Best-effort per
 * compensation — one failure doesn't abort the rest of the batch. */
export async function handOffCompensations(compensationIds: string[], client: SupabaseClient = supabase): Promise<void> {
  for (const id of compensationIds) {
    try {
      await handOffCompensation(id, client);
    } catch (error) {
      console.error("Error handing off compensation:", id, error);
    }
  }
}

/** Step 2's own picker data source — Handed Off compensations not yet
 * claimed by any Settlement Item (Decision 5). Confirmed compensations
 * never appear here (Decision 2). Only ACTIVE Settlement Items count as a
 * claim (Finance Project #1, Phase B) — once cancel_settlement_with_
 * reversal() deactivates a Settlement Item, its Compensation (now back to
 * Confirmed) is no longer "claimed," so after a fresh hand-off it can
 * appear here again for a new Settlement. */
export async function getEligibleCompensations(client: SupabaseClient = supabase) {
  const { data: claimed, error: claimedError } = await client.from("settlement_items").select("compensation_id").eq("is_active", true);
  if (claimedError) throw claimedError;
  const claimedIds = new Set((claimed ?? []).map((i: { compensation_id: string }) => i.compensation_id));

  const { data, error } = await client
    .from("compensations")
    .select("id, compensation_code, compensation_type, calculated_amount, partner_id, partner:partners(id, name)")
    .eq("status", "Handed Off")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).filter((c: { id: string }) => !claimedIds.has(c.id));
}

/** Step 2 — creates a Settlement Request from one or more already-Handed-Off,
 * not-yet-settled Compensations for the SAME recipient (a Settlement pays
 * out to exactly one Partner; bundling across recipients would make
 * "Recipient" on Settlement Detail meaningless). Decision 5 is additionally
 * backstopped by `settlement_items.compensation_id` being UNIQUE at the DB
 * level. */
export async function createSettlement(
  compensationIds: string[],
  settlementMethod: string,
  client: SupabaseClient = supabase
): Promise<Settlement> {
  if (compensationIds.length === 0) {
    throw new SettlementRuleViolationError("Vui lòng chọn ít nhất một compensation");
  }

  const compensations = await Promise.all(compensationIds.map((id) => getCompensationById(id, client)));
  const partnerIds = new Set<string | null>();
  for (let i = 0; i < compensations.length; i++) {
    const compensation = compensations[i];
    if (!compensation) throw new SettlementRuleViolationError("Không tìm thấy compensation");
    if (compensation.status !== "Handed Off") {
      throw new SettlementRuleViolationError(
        `Chỉ có thể chọn compensation ở trạng thái Handed Off (mã "${compensation.compensation_code}" đang ở trạng thái "${compensation.status}")`
      );
    }
    partnerIds.add(compensation.partner_id);
  }
  if (partnerIds.size > 1) {
    throw new SettlementRuleViolationError("Tất cả compensation trong một Settlement phải cùng một người nhận (Partner)");
  }
  const partnerId = [...partnerIds][0];
  if (!partnerId) throw new SettlementRuleViolationError("Compensation không có người nhận (Partner) để tạo Settlement");

  // Finance Project #1, Phase B — only an ACTIVE Settlement Item counts as
  // a claim. A Compensation whose prior Settlement Item was deactivated by
  // cancel_settlement_with_reversal() (its Settlement was cancelled, it
  // reverted to Confirmed, and was handed off again) must be selectable
  // here, backstopped at the DB level by the partial unique index scoped
  // to is_active (2026082102_settlement_cancellation_reversal.sql).
  const { data: alreadyClaimed, error: claimedError } = await client
    .from("settlement_items")
    .select("compensation_id")
    .in("compensation_id", compensationIds)
    .eq("is_active", true);
  if (claimedError) throw claimedError;
  if ((alreadyClaimed ?? []).length > 0) {
    throw new SettlementRuleViolationError("Một hoặc nhiều compensation đã thuộc về một Settlement khác");
  }

  const settlement_code = await generateSettlementCode(client);
  const { data: settlement, error: settlementError } = await client
    .from("settlements")
    .insert({
      settlement_code,
      recipient_type: "Partner",
      partner_id: partnerId,
      settlement_method: settlementMethod,
      status: "Draft",
    })
    .select()
    .single();
  if (settlementError) throw settlementError;

  const { error: itemsError } = await client
    .from("settlement_items")
    .insert(compensationIds.map((compensation_id) => ({ settlement_id: settlement.id, compensation_id })));
  if (itemsError) throw itemsError;

  await logActivity({ staff_id: null, action: "settlement_created", entity: "settlement", entity_id: settlement.id });

  const created = await getSettlementById(settlement.id, client);
  if (!created) throw new SettlementRuleViolationError("Đã tạo settlement nhưng không thể tải lại");
  return created;
}

export interface SettlementListFilters {
  searchTerm?: string;
  status?: string;
}

export async function getSettlements(filters: SettlementListFilters = {}, client: SupabaseClient = supabase): Promise<Settlement[]> {
  let query = client.from("settlements").select(WITH_JOINS);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching settlements:", error);
    return [];
  }

  let rows = (data ?? []).map(withComputedTotal);
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (s) =>
        s.settlement_code.toLowerCase().includes(term) ||
        s.partner?.name?.toLowerCase().includes(term) ||
        s.items.some((item) => item.compensation?.compensation_code?.toLowerCase().includes(term))
    );
  }
  return rows;
}

export async function getSettlementById(id: string, client: SupabaseClient = supabase): Promise<Settlement | null> {
  const { data, error } = await client.from("settlements").select(WITH_JOINS).eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching settlement:", error);
    return null;
  }
  return data ? withComputedTotal(data) : null;
}

async function requireSettlement(id: string, client: SupabaseClient): Promise<Settlement> {
  const settlement = await getSettlementById(id, client);
  if (!settlement) throw new SettlementRuleViolationError("Không tìm thấy settlement");
  return settlement;
}

/** Draft -> Pending ("submitted; awaiting approval", §5). */
export async function submitSettlement(id: string, client: SupabaseClient = supabase): Promise<Settlement> {
  const settlement = await requireSettlement(id, client);
  if (settlement.status !== "Draft") {
    throw new SettlementRuleViolationError(`Không thể gửi duyệt từ trạng thái "${settlement.status}"`);
  }
  const { error } = await client
    .from("settlements")
    .update({ status: "Pending", requested_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  return requireSettlement(id, client);
}

/** Pending -> Approved (§5). */
export async function approveSettlement(id: string, actorStaffId: string | null, client: SupabaseClient = supabase): Promise<Settlement> {
  const settlement = await requireSettlement(id, client);
  if (settlement.status !== "Pending") {
    throw new SettlementRuleViolationError(`Không thể duyệt từ trạng thái "${settlement.status}"`);
  }
  const { error } = await client
    .from("settlements")
    .update({ status: "Approved", approved_at: new Date().toISOString(), approved_by: actorStaffId })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "settlement_approved", entity: "settlement", entity_id: id });
  return requireSettlement(id, client);
}

/** Approved -> Completed. Terminal (§3 Finalization, §5). No Compensation
 * Ledger call of any kind — see this file's own top comment. */
export async function completeSettlement(id: string, actorStaffId: string | null, client: SupabaseClient = supabase): Promise<Settlement> {
  const settlement = await requireSettlement(id, client);
  if (settlement.status !== "Approved") {
    throw new SettlementRuleViolationError(`Không thể hoàn tất từ trạng thái "${settlement.status}"`);
  }
  const { error } = await client
    .from("settlements")
    .update({ status: "Completed", completed_at: new Date().toISOString(), completed_by: actorStaffId })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "settlement_completed", entity: "settlement", entity_id: id });
  return requireSettlement(id, client);
}

/** Draft/Pending/Approved -> Cancelled (§4: "from any non-terminal state").
 * Finance Project #1, Phase B (Product Owner Approval, 2026-08-21) — the
 * former known limitation (every member Compensation stayed permanently
 * "Handed Off") is now closed: calls cancel_settlement_with_reversal() via
 * the service_role admin client, same governed-write pattern as
 * markSettlementPaid() above. Atomically reverts every member Compensation
 * still Handed Off back to Confirmed and deactivates its Settlement Item,
 * so it can be handed off again into a different Settlement. The status
 * guard (only Draft/Pending/Approved may be cancelled) runs inside the RPC
 * before any write, so calling this twice on an already-Cancelled
 * Settlement is rejected outright, never re-running the reversal. The
 * RPC's own function body already writes the activity_logs entries (one
 * per reverted Compensation, one for the Settlement itself) — no separate
 * logActivity() call here, to avoid double-logging. */
export async function cancelSettlement(id: string, actorStaffId: string, client: SupabaseClient = supabase): Promise<Settlement> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("cancel_settlement_with_reversal", {
    p_staff_id: actorStaffId,
    p_settlement_id: id,
  });
  if (error) throw new SettlementRuleViolationError(error.message);

  return requireSettlement(id, client);
}

/** Completed -> Paid (Finance Project #1, Phase A, Product Owner Approval
 * 2026-08-21) — the only path that can ever reach this transition. Calls
 * mark_settlement_paid() via the service_role admin client, mirroring this
 * project's own established governed-write pattern for financial state
 * (Money & Debt Ledger's create_payment_with_ledger_sync /
 * create_money_debt_ledger_entry, both also service_role-only RPCs): the DB
 * independently re-verifies settlement.manage for whichever staff id this
 * already-requirePermission()-checked caller asserts, and cascades every
 * member Compensation still Handed Off -> Paid inside the same transaction.
 * A direct client-side `.update({status:'Paid'})` is rejected by RLS (see
 * the migration) — this is the only way in. The RPC's own function body
 * already writes the activity_logs entries (one per paid Compensation, one
 * for the Settlement itself) — no separate logActivity() call here, to
 * avoid double-logging. */
export async function markSettlementPaid(
  id: string,
  actorStaffId: string,
  paymentReference: string,
  receivingAccountId: string,
  client: SupabaseClient = supabase
): Promise<Settlement> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("mark_settlement_paid", {
    p_staff_id: actorStaffId,
    p_settlement_id: id,
    p_payment_reference: paymentReference,
    p_receiving_account_id: receivingAccountId,
  });
  if (error) throw new SettlementRuleViolationError(error.message);

  return requireSettlement(id, client);
}

export { CompensationRuleViolationError };
