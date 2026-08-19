import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ConsignmentFinancialRecord } from "@/types/consignmentFinancialRecord";
import { Order, OrderItem } from "@/types/order";
import { getActiveConsignmentByProductId, markConsignmentSold } from "@/lib/consignment/consignment.service";
import { logActivity } from "@/lib/activityLog.service";

/** Consignment Financial Record (D11, LOCKED). Auto-creation trigger: Order
 * Completion (docs/03_ORDER_SPEC.md §7/§14 — Sale Price is locked only
 * once Completed), wired from lib/orders/order.service.ts's completeOrder()
 * exactly the same way createCompensationsForOrder is wired at
 * reserveOrder() — this codebase has no real Business Event bus anywhere
 * (see lib/compensation/compensation.service.ts's own header comment), so
 * a direct, best-effort call at the exact moment of the triggering
 * transition is the established, honest equivalent used project-wide.
 *
 * Fee Base (D1, LOCKED): Sale Price = the Order Item's own `line_total` —
 * the same field Order's own snapshot bridge (complete_order_with_snapshots)
 * already treats as "the actual post-discount amount for THIS line only"
 * (order.service.ts's own comment at its Compensation/Commission call
 * site). Consignment reads this exact figure, never a recalculated one.
 *
 * No adjustment mechanism exists (D6) — every field below is written once,
 * at creation, and never updated by any function in this file. */

const FEE_RATE = 0.1; // D1, LOCKED: Fee = Sale Price × 10%.

const WITH_JOINS =
  "*, consignment:consignments(id, consignment_code, customer_id, customer:customers(id, full_name, customer_code)), order:orders(id, order_number)";

/** Best-effort, never throws back into Order's own completeOrder() —
 * identical convention to createCompensationsForOrder/
 * markCompensationsEligible. For each completed Order Item, checks whether
 * its Product has an active Consignment (RECEIVED or AVAILABLE_FOR_SALE);
 * if so, creates the Financial Record and transitions that Consignment to
 * SOLD. Products with no Consignment are silently skipped — the ordinary,
 * expected case for the vast majority of Order Items. */
export async function createConsignmentFinancialRecordsForOrder(
  order: Order,
  items: OrderItem[],
  client: SupabaseClient = supabase
): Promise<void> {
  for (const item of items) {
    try {
      const consignment = await getActiveConsignmentByProductId(item.product_id, client);
      if (!consignment) continue;

      const sale_price = item.line_total;
      const fee = Math.round(sale_price * FEE_RATE);
      const customer_payable = sale_price - fee;

      const { data, error } = await client
        .from("consignment_financial_records")
        .insert({
          consignment_id: consignment.id,
          order_id: order.id,
          order_item_id: item.id,
          sale_price,
          fee,
          customer_payable,
        })
        .select()
        .single();
      if (error) throw error;

      await markConsignmentSold(consignment.id, client);
      await logActivity({
        staff_id: null,
        action: "consignment_financial_record_created",
        entity: "consignment_financial_record",
        entity_id: data.id,
      });
    } catch (error) {
      console.error("Error creating consignment financial record for order item:", item.id, error);
    }
  }
}

export interface ConsignmentFinancialRecordListFilters {
  consignmentId?: string;
  orderId?: string;
}

export async function getConsignmentFinancialRecords(
  filters: ConsignmentFinancialRecordListFilters = {},
  client: SupabaseClient = supabase
): Promise<ConsignmentFinancialRecord[]> {
  let query = client.from("consignment_financial_records").select(WITH_JOINS);
  if (filters.consignmentId) query = query.eq("consignment_id", filters.consignmentId);
  if (filters.orderId) query = query.eq("order_id", filters.orderId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching consignment financial records:", error);
    return [];
  }
  return data as unknown as ConsignmentFinancialRecord[];
}

export async function getConsignmentFinancialRecordById(
  id: string,
  client: SupabaseClient = supabase
): Promise<ConsignmentFinancialRecord | null> {
  const { data, error } = await client.from("consignment_financial_records").select(WITH_JOINS).eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching consignment financial record:", error);
    return null;
  }
  return data as unknown as ConsignmentFinancialRecord | null;
}
