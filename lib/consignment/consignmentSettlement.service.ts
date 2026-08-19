import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ConsignmentSettlement, ConsignmentSettlementItem } from "@/types/consignmentSettlement";
import { logActivity } from "@/lib/activityLog.service";

/** Consignment Settlement (D8/D03, LOCKED). Extends Settlement's own
 * *pattern* only (same lifecycle shape, same principles) — a structurally
 * separate table/service from the existing, Compensation-facing
 * `settlements`/`settlement_items`/`lib/settlement/settlement.service.ts`.
 * See types/consignmentSettlement.ts's own header comment for the exact
 * evidence this separation is based on.
 *
 * Unlike Compensation (which has its own Draft->Pending->Confirmed->Handed
 * Off approval lifecycle before Settlement may touch it), a Consignment
 * Financial Record has no approval status of its own (D11 — created once,
 * write-once, no intermediate lifecycle was decided) — so every Financial
 * Record not yet claimed by a Consignment Settlement Item is immediately
 * eligible, with no "must be Handed Off first" gate to check. This is the
 * one structural simplification versus the existing Settlement's own
 * two-step flow, not an omission. */

const ITEM_JOIN =
  "*, consignment_financial_record:consignment_financial_records(id, customer_payable, consignment:consignments(id, consignment_code), order:orders(id, order_number))";
const WITH_JOINS = `*, customer:customers(id, full_name, customer_code), items:consignment_settlement_items(${ITEM_JOIN})`;

function computeTotal(items: ConsignmentSettlementItem[]): number {
  return items.reduce((sum, item) => sum + (item.consignment_financial_record?.customer_payable ?? 0), 0);
}

function withComputedTotal(row: unknown): ConsignmentSettlement {
  const settlement = row as ConsignmentSettlement;
  return { ...settlement, total_amount: computeTotal(settlement.items ?? []) };
}

async function generateConsignmentSettlementCode(client: SupabaseClient): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `CSETT-${datePart}-`;

  const { data, error } = await client.from("consignment_settlements").select("id").like("settlement_code", `${prefix}%`);
  if (error) throw error;

  const sequence = (data?.length ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

export class ConsignmentSettlementRuleViolationError extends Error {}

/** Financial Records not yet claimed by any Consignment Settlement Item —
 * no separate "must be Handed Off" gate exists (see header comment). */
export async function getEligibleConsignmentFinancialRecords(client: SupabaseClient = supabase) {
  const { data: claimed, error: claimedError } = await client
    .from("consignment_settlement_items")
    .select("consignment_financial_record_id");
  if (claimedError) throw claimedError;
  const claimedIds = new Set((claimed ?? []).map((i: { consignment_financial_record_id: string }) => i.consignment_financial_record_id));

  const { data, error } = await client
    .from("consignment_financial_records")
    .select(
      "id, customer_payable, consignment:consignments(id, consignment_code, customer_id, customer:customers(id, full_name))"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).filter((r: { id: string }) => !claimedIds.has(r.id));
}

/** Bundles one or more not-yet-claimed Consignment Financial Records for
 * the SAME Consignor (Customer) into a new Consignment Settlement Request
 * — mirrors createSettlement()'s own "same recipient" constraint exactly,
 * substituting Customer for Partner. Backstopped by
 * `consignment_settlement_items.consignment_financial_record_id` being
 * UNIQUE at the DB level. */
export async function createConsignmentSettlement(
  financialRecordIds: string[],
  settlementMethod: string,
  client: SupabaseClient = supabase
): Promise<ConsignmentSettlement> {
  if (financialRecordIds.length === 0) {
    throw new ConsignmentSettlementRuleViolationError("Vui lòng chọn ít nhất một consignment financial record");
  }

  const { data: records, error: recordsError } = await client
    .from("consignment_financial_records")
    .select("id, customer_payable, consignment:consignments(customer_id)")
    .in("id", financialRecordIds);
  if (recordsError) throw recordsError;
  if ((records ?? []).length !== financialRecordIds.length) {
    throw new ConsignmentSettlementRuleViolationError("Không tìm thấy một hoặc nhiều consignment financial record");
  }

  const customerIds = new Set(
    (records ?? []).map((r: { consignment: { customer_id: string } | { customer_id: string }[] | null }) => {
      const c = Array.isArray(r.consignment) ? r.consignment[0] : r.consignment;
      return c?.customer_id ?? null;
    })
  );
  if (customerIds.size > 1) {
    throw new ConsignmentSettlementRuleViolationError(
      "Tất cả consignment financial record trong một Settlement phải cùng một khách hàng (Consignor)"
    );
  }
  const customerId = [...customerIds][0];
  if (!customerId) {
    throw new ConsignmentSettlementRuleViolationError("Consignment financial record không có khách hàng (Consignor) để tạo Settlement");
  }

  const { data: alreadyClaimed, error: claimedError } = await client
    .from("consignment_settlement_items")
    .select("consignment_financial_record_id")
    .in("consignment_financial_record_id", financialRecordIds);
  if (claimedError) throw claimedError;
  if ((alreadyClaimed ?? []).length > 0) {
    throw new ConsignmentSettlementRuleViolationError("Một hoặc nhiều consignment financial record đã thuộc về một Settlement khác");
  }

  const settlement_code = await generateConsignmentSettlementCode(client);
  const { data: settlement, error: settlementError } = await client
    .from("consignment_settlements")
    .insert({
      settlement_code,
      customer_id: customerId,
      settlement_method: settlementMethod,
      status: "Draft",
    })
    .select()
    .single();
  if (settlementError) throw settlementError;

  const { error: itemsError } = await client.from("consignment_settlement_items").insert(
    financialRecordIds.map((consignment_financial_record_id) => ({
      consignment_settlement_id: settlement.id,
      consignment_financial_record_id,
    }))
  );
  if (itemsError) throw itemsError;

  await logActivity({
    staff_id: null,
    action: "consignment_settlement_created",
    entity: "consignment_settlement",
    entity_id: settlement.id,
  });

  const created = await getConsignmentSettlementById(settlement.id, client);
  if (!created) throw new ConsignmentSettlementRuleViolationError("Đã tạo settlement nhưng không thể tải lại");
  return created;
}

export interface ConsignmentSettlementListFilters {
  searchTerm?: string;
  status?: string;
}

export async function getConsignmentSettlements(
  filters: ConsignmentSettlementListFilters = {},
  client: SupabaseClient = supabase
): Promise<ConsignmentSettlement[]> {
  let query = client.from("consignment_settlements").select(WITH_JOINS);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching consignment settlements:", error);
    return [];
  }

  let rows = (data ?? []).map(withComputedTotal);
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (s) =>
        s.settlement_code.toLowerCase().includes(term) ||
        s.customer?.full_name?.toLowerCase().includes(term)
    );
  }
  return rows;
}

export async function getConsignmentSettlementById(
  id: string,
  client: SupabaseClient = supabase
): Promise<ConsignmentSettlement | null> {
  const { data, error } = await client.from("consignment_settlements").select(WITH_JOINS).eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching consignment settlement:", error);
    return null;
  }
  return data ? withComputedTotal(data) : null;
}

async function requireConsignmentSettlement(id: string, client: SupabaseClient): Promise<ConsignmentSettlement> {
  const settlement = await getConsignmentSettlementById(id, client);
  if (!settlement) throw new ConsignmentSettlementRuleViolationError("Không tìm thấy settlement");
  return settlement;
}

/** Draft -> Pending. */
export async function submitConsignmentSettlement(id: string, client: SupabaseClient = supabase): Promise<ConsignmentSettlement> {
  const settlement = await requireConsignmentSettlement(id, client);
  if (settlement.status !== "Draft") {
    throw new ConsignmentSettlementRuleViolationError(`Không thể gửi duyệt từ trạng thái "${settlement.status}"`);
  }
  const { error } = await client
    .from("consignment_settlements")
    .update({ status: "Pending", requested_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  return requireConsignmentSettlement(id, client);
}

/** Pending -> Approved. */
export async function approveConsignmentSettlement(
  id: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<ConsignmentSettlement> {
  const settlement = await requireConsignmentSettlement(id, client);
  if (settlement.status !== "Pending") {
    throw new ConsignmentSettlementRuleViolationError(`Không thể duyệt từ trạng thái "${settlement.status}"`);
  }
  const { error } = await client
    .from("consignment_settlements")
    .update({ status: "Approved", approved_at: new Date().toISOString(), approved_by: actorStaffId })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "consignment_settlement_approved", entity: "consignment_settlement", entity_id: id });
  return requireConsignmentSettlement(id, client);
}

/** Approved -> Completed. Terminal — this is the "Customer Paid" fact
 * (§5 of the Final Design Specification): reading a Completed Consignment
 * Settlement's own total_amount (or its Items' individual
 * customer_payable figures) IS the Settlement Result. No separate
 * Settlement Result table/column is introduced — Completed status +
 * completed_at/completed_by already carry exactly what
 * docs/14_SETTLEMENT_SPEC.md §9 names ("the amount actually paid... when
 * it happened... a reference/confirmation identifier"), the same way the
 * existing Settlement's own Completed record already does. */
export async function completeConsignmentSettlement(
  id: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<ConsignmentSettlement> {
  const settlement = await requireConsignmentSettlement(id, client);
  if (settlement.status !== "Approved") {
    throw new ConsignmentSettlementRuleViolationError(`Không thể hoàn tất từ trạng thái "${settlement.status}"`);
  }
  const { error } = await client
    .from("consignment_settlements")
    .update({ status: "Completed", completed_at: new Date().toISOString(), completed_by: actorStaffId })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "consignment_settlement_completed", entity: "consignment_settlement", entity_id: id });
  return requireConsignmentSettlement(id, client);
}

/** Draft/Pending/Approved -> Cancelled. */
export async function cancelConsignmentSettlement(id: string, client: SupabaseClient = supabase): Promise<ConsignmentSettlement> {
  const settlement = await requireConsignmentSettlement(id, client);
  if (!["Draft", "Pending", "Approved"].includes(settlement.status)) {
    throw new ConsignmentSettlementRuleViolationError(`Không thể hủy từ trạng thái "${settlement.status}"`);
  }
  const { error } = await client
    .from("consignment_settlements")
    .update({ status: "Cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: null, action: "consignment_settlement_cancelled", entity: "consignment_settlement", entity_id: id });
  return requireConsignmentSettlement(id, client);
}

/** Customer Outstanding (§5 of the Final Design Specification) — derived
 * live, never stored: Customer Payable minus what's already reflected as
 * Paid via a Completed Consignment Settlement referencing it. Mirrors the
 * same "live-derived-never-stored" pattern this codebase already uses for
 * Payment Status (order.rules.ts's derivePaymentStatus()) and Money & Debt
 * Ledger's own SUM(IN)-SUM(OUT) balance formula. */
export async function getConsignmentOutstandingByCustomerId(
  customerId: string,
  client: SupabaseClient = supabase
): Promise<number> {
  const { data: records, error: recordsError } = await client
    .from("consignment_financial_records")
    .select("id, customer_payable, consignment:consignments!inner(customer_id)")
    .eq("consignment.customer_id", customerId);
  if (recordsError) throw recordsError;

  const totalPayable = (records ?? []).reduce((sum: number, r: { customer_payable: number }) => sum + r.customer_payable, 0);

  const { data: paidItems, error: paidError } = await client
    .from("consignment_settlement_items")
    .select("consignment_financial_record:consignment_financial_records(customer_payable), consignment_settlement:consignment_settlements!inner(status, customer_id)")
    .eq("consignment_settlement.customer_id", customerId)
    .eq("consignment_settlement.status", "Completed");
  if (paidError) throw paidError;

  const totalPaid = (paidItems ?? []).reduce((sum: number, item: { consignment_financial_record: { customer_payable: number } | { customer_payable: number }[] | null }) => {
    const record = Array.isArray(item.consignment_financial_record) ? item.consignment_financial_record[0] : item.consignment_financial_record;
    return sum + (record?.customer_payable ?? 0);
  }, 0);

  return totalPayable - totalPaid;
}
