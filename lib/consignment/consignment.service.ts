import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Consignment, CreateConsignmentInput } from "@/types/consignment";
import { logActivity } from "@/lib/activityLog.service";

/** Consignment. Increment 1 shipped the domain entity + Return flow.
 * Increment 2 (lib/consignment/consignmentFinancialRecord.service.ts) adds
 * the SOLD transition, wired from lib/orders/order.service.ts's
 * completeOrder() — mirroring exactly how createCompensationsForOrder is
 * wired at reserveOrder(). markConsignmentSold below is that transition's
 * own implementation; it is never called directly by staff action, only by
 * the Order-integration hook (Consignment's own status is not a
 * user-facing "mark sold" action — the Order completing IS the sale, per
 * "Order remains Source of Truth for Sale").
 *
 * Status model (D02/D01, LOCKED): RECEIVED, AVAILABLE_FOR_SALE, SOLD,
 * RETURNED — no CANCELLED this phase.
 *
 * Product Status non-interference (D7/D01, LOCKED): no function in this
 * file ever reads or writes `products.status`. */

const WITH_JOINS =
  "*, customer:customers(id, full_name, customer_code), product:products(id, product_name, product_code, status)";

async function generateConsignmentCode(client: SupabaseClient): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `CNS-${datePart}-`;

  const { data, error } = await client.from("consignments").select("id").like("consignment_code", `${prefix}%`);
  if (error) throw error;

  const sequence = (data?.length ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

export class ConsignmentRuleViolationError extends Error {}

/** RECEIVED — the only creation path. Consignor = Customer (D9); no new
 * identity entity. Known, explicitly-flagged gap (Implementation Plan
 * Phase 15 Risk Audit): whether a Product may have more than one
 * Consignment over its lifetime (e.g., received again after a prior
 * Return) is not decided anywhere — this function does not block it,
 * consistent with "do not invent a business rule" where none exists. */
export async function createConsignment(
  input: CreateConsignmentInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<Consignment> {
  const consignment_code = await generateConsignmentCode(client);
  const { data, error } = await client
    .from("consignments")
    .insert({
      consignment_code,
      customer_id: input.customer_id,
      product_id: input.product_id,
      status: "RECEIVED",
    })
    .select(WITH_JOINS)
    .single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "consignment_received", entity: "consignment", entity_id: data.id });
  return data as unknown as Consignment;
}

export interface ConsignmentListFilters {
  searchTerm?: string;
  status?: string;
  customerId?: string;
}

export async function getConsignments(
  filters: ConsignmentListFilters = {},
  client: SupabaseClient = supabase
): Promise<Consignment[]> {
  let query = client.from("consignments").select(WITH_JOINS);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching consignments:", error);
    return [];
  }

  let rows = data as unknown as Consignment[];
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (c) =>
        c.consignment_code.toLowerCase().includes(term) ||
        c.customer?.full_name?.toLowerCase().includes(term) ||
        c.product?.product_name?.toLowerCase().includes(term) ||
        c.product?.product_code?.toLowerCase().includes(term)
    );
  }
  return rows;
}

export async function getConsignmentById(id: string, client: SupabaseClient = supabase): Promise<Consignment | null> {
  const { data, error } = await client.from("consignments").select(WITH_JOINS).eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching consignment:", error);
    return null;
  }
  return data as unknown as Consignment | null;
}

async function requireConsignment(id: string, client: SupabaseClient): Promise<Consignment> {
  const consignment = await getConsignmentById(id, client);
  if (!consignment) throw new ConsignmentRuleViolationError("Không tìm thấy consignment");
  return consignment;
}

/** RECEIVED -> AVAILABLE_FOR_SALE. */
export async function markConsignmentAvailable(
  id: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<Consignment> {
  const consignment = await requireConsignment(id, client);
  if (consignment.status !== "RECEIVED") {
    throw new ConsignmentRuleViolationError(`Không thể chuyển sang AVAILABLE_FOR_SALE từ trạng thái "${consignment.status}"`);
  }
  const { error } = await client.from("consignments").update({ status: "AVAILABLE_FOR_SALE" }).eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "consignment_available", entity: "consignment", entity_id: id });
  return requireConsignment(id, client);
}

/** RECEIVED or AVAILABLE_FOR_SALE -> RETURNED (D5/D01, LOCKED — "Return
 * allowed while unsold," may occur even before active listing). Terminal.
 *
 * Explicitly, per D01/D05/D06 of the Final Design Specification, all
 * derivable by construction and NOT re-decided here:
 *   - products.status is never read or written by this function.
 *   - No Order, Order Item, or Payment row is touched — a return-while-
 *     unsold has no Sale Price, so nothing downstream exists to affect.
 *   - No Consignment Financial Record is created or referenced — none
 *     exists yet at this point in the lifecycle. */
export async function returnConsignment(
  id: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<Consignment> {
  const consignment = await requireConsignment(id, client);
  if (!["RECEIVED", "AVAILABLE_FOR_SALE"].includes(consignment.status)) {
    throw new ConsignmentRuleViolationError(`Không thể trả hàng từ trạng thái "${consignment.status}"`);
  }
  const { error } = await client
    .from("consignments")
    .update({ status: "RETURNED", returned_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "consignment_returned", entity: "consignment", entity_id: id });
  return requireConsignment(id, client);
}

/** RECEIVED or AVAILABLE_FOR_SALE -> SOLD. Called exclusively from
 * lib/consignment/consignmentFinancialRecord.service.ts's
 * createConsignmentFinancialRecordsForOrder(), itself called only from
 * Order's own completeOrder(). Deliberately accepts either prior state
 * (not just AVAILABLE_FOR_SALE): the locked lifecycle diagram draws SOLD
 * as reachable only from AVAILABLE_FOR_SALE, but nothing in Order's own
 * reservation mechanism checks Consignment status before a Product can be
 * added to an Order Item (Product Status non-interference, D01/D07) — so a
 * still-RECEIVED consigned Product can legitimately reach a completed
 * Order without ever being marked available first. Silently skipping
 * Financial Record creation in that case would drop a real payable
 * obligation to the Consignor; transitioning directly to SOLD from either
 * state avoids that, at the cost of being slightly more lenient than the
 * diagram's drawn arrows. This is a defensive engineering choice about an
 * edge case the locked specification does not address, not a new
 * business/financial rule — the Fee/Payable formula itself (D1/D2) is
 * unaffected either way. Flagged here, not silently decided. */
export async function markConsignmentSold(
  id: string,
  client: SupabaseClient = supabase
): Promise<Consignment | null> {
  const consignment = await getConsignmentById(id, client);
  if (!consignment) return null;
  if (!["RECEIVED", "AVAILABLE_FOR_SALE"].includes(consignment.status)) return null;

  const { error } = await client.from("consignments").update({ status: "SOLD" }).eq("id", id);
  if (error) throw error;

  await logActivity({ staff_id: null, action: "consignment_sold", entity: "consignment", entity_id: id });
  return getConsignmentById(id, client);
}

/** Active (pre-terminal) Consignment for a given Product, if any — the
 * lookup createConsignmentFinancialRecordsForOrder uses to decide whether
 * a completed Order Item's Product was under consignment. */
export async function getActiveConsignmentByProductId(
  productId: string,
  client: SupabaseClient = supabase
): Promise<Consignment | null> {
  const { data, error } = await client
    .from("consignments")
    .select(WITH_JOINS)
    .eq("product_id", productId)
    .in("status", ["RECEIVED", "AVAILABLE_FOR_SALE"])
    .maybeSingle();
  if (error) {
    console.error("Error fetching active consignment for product:", productId, error);
    return null;
  }
  return data as unknown as Consignment | null;
}
