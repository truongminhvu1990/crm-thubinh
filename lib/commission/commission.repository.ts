import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { CommissionRule, SalesCommission, CommissionStatus } from "@/types/commission";

// Raw data access only - no business logic (matching, calculation, status
// transition rules) lives here. That all belongs in commission.service.ts,
// per the spec's explicit CommissionService/CommissionRepository split.

/** Only these columns may ever be written after a commission snapshot is
 * created - the calculation fields (sale_amount, commission_percent,
 * commission_amount, purchase_id, customer_id, salesperson*) are
 * write-once at insert time (Business Rule 1) and are never included in
 * this list. */
const STATUS_UPDATE_FIELDS = ["status", "paid_at", "paid_by", "note"] as const;

/** `client` defaults to the anon-defaulting singleton so every existing
 * caller that doesn't pass one (createSnapshotForPurchase, scripts/backfill-
 * orders.ts) keeps its exact current behavior unchanged. completeOrder()
 * (lib/orders/order.service.ts) passes its own authenticated auditClient —
 * commission_rules' RLS is authenticated-only, so without this the anon
 * role sees zero rows and Order completion falsely reports "no matching
 * commission rate found." */
export async function getActiveCommissionRules(client: SupabaseClient = supabase): Promise<CommissionRule[]> {
  const { data, error } = await client
    .from("commission_rules")
    .select("*")
    .eq("is_active", true)
    .order("minimum_amount", { ascending: true });

  if (error) {
    console.error("Error fetching commission rules:", error);
    return [];
  }
  return data as CommissionRule[];
}

export async function insertCommissionSnapshot(
  snapshot: Omit<SalesCommission, "id" | "created_at" | "customer">
): Promise<{ data: SalesCommission | null; error: unknown }> {
  const { data, error } = await supabase
    .from("sales_commissions")
    .insert(snapshot)
    .select()
    .single();

  if (error) {
    console.error("Error inserting commission snapshot:", error);
    return { data: null, error };
  }
  return { data: data as SalesCommission, error: null };
}

/** `client` defaults to the browser Supabase client so every existing caller
 * keeps its exact current behavior unchanged (getDashboardCommissionStats,
 * summarizeCommissions' callers). Backend API Foundation (Package 4C, Wave 2)
 * passes a server client instead, from app/api/commissions/**. */
export async function getAllCommissions(client: SupabaseClient = supabase): Promise<SalesCommission[]> {
  const { data, error } = await client
    .from("sales_commissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching commissions:", error);
    return [];
  }
  return data as SalesCommission[];
}

export async function getCommissionById(
  id: string,
  client: SupabaseClient = supabase
): Promise<SalesCommission | null> {
  const { data, error } = await client.from("sales_commissions").select("*").eq("id", id).single();

  if (error) {
    console.error("Error fetching commission:", error);
    return null;
  }
  return data as SalesCommission;
}

/**
 * Compensation/Commission Void (Product Owner Authorization, 2026-08-20,
 * §5 LOCKED) — the 3-hop lookup approveCommission/markCommissionPaid use to
 * find the Order behind a Commission, since sales_commissions.purchase_id
 * carries no real FK (deliberate, see this file's own header / 20260721_
 * sales_commission_module.sql). `purchase_id -> customer_purchases.id ->
 * order_item_id -> order_items.order_id -> orders.order_status`.
 *
 * Tri-state result, deliberately NOT a plain `string | null`:
 *   - "no_order_link": customer_purchases.order_item_id is NULL by design
 *     (a manually-entered/legacy row predating the Orders module - the same
 *     category lib/reports/reports.service.ts's isRevenueRecognized already
 *     treats as "always recognized," never Order-gated). This commission
 *     was never subject to Order Cancellation in the first place, so the
 *     gate does not apply - the caller must NOT fail-closed here, or every
 *     legacy commission would become permanently unapprovable/unpayable.
 *   - "orphan": an order_item_id IS set but a later hop couldn't resolve
 *     (missing order_item, or an order_item with no order) - a genuine
 *     data-integrity problem, not "no link by design". The caller MUST
 *     fail-closed here (Product Owner Authorization §5, LOCKED: "Không tự
 *     suy đoán Order. Không fail-open").
 *   - "resolved": the Order was found; `orderStatus` is its current value.
 */
export type CommissionOrderLookup =
  | { kind: "no_order_link" }
  | { kind: "orphan" }
  | { kind: "resolved"; orderStatus: string };

export async function resolveOrderStatusForCommission(
  purchaseId: string,
  client: SupabaseClient = supabase
): Promise<CommissionOrderLookup> {
  const { data: purchase, error: purchaseError } = await client
    .from("customer_purchases")
    .select("order_item_id")
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchaseError) {
    console.error("Error resolving purchase for commission order-status lookup:", purchaseError);
    return { kind: "orphan" };
  }
  if (!purchase) return { kind: "orphan" }; // purchase_id itself doesn't resolve - genuinely broken, not "no link by design"
  if (!purchase.order_item_id) return { kind: "no_order_link" };

  const { data: item, error: itemError } = await client
    .from("order_items")
    .select("order_id")
    .eq("id", purchase.order_item_id)
    .maybeSingle();
  if (itemError) {
    console.error("Error resolving order_item for commission order-status lookup:", itemError);
    return { kind: "orphan" };
  }
  if (!item?.order_id) return { kind: "orphan" };

  const { data: order, error: orderError } = await client
    .from("orders")
    .select("order_status")
    .eq("id", item.order_id)
    .maybeSingle();
  if (orderError) {
    console.error("Error resolving order for commission order-status lookup:", orderError);
    return { kind: "orphan" };
  }
  if (!order?.order_status) return { kind: "orphan" };

  return { kind: "resolved", orderStatus: order.order_status };
}

export async function updateCommissionStatusFields(
  id: string,
  fields: Partial<Pick<SalesCommission, "status" | "paid_at" | "paid_by" | "note">>
): Promise<{ data: SalesCommission | null; error: unknown }> {
  const filtered: Record<string, unknown> = {};
  (STATUS_UPDATE_FIELDS as readonly string[]).forEach((key) => {
    const value = (fields as Record<string, unknown>)[key];
    if (value !== undefined) filtered[key] = value;
  });

  const { data, error } = await supabase
    .from("sales_commissions")
    .update(filtered)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating commission status:", error);
    return { data: null, error };
  }
  return { data: data as SalesCommission, error: null };
}

export type { CommissionStatus };
