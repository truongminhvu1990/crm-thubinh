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

export async function getActiveCommissionRules(): Promise<CommissionRule[]> {
  const { data, error } = await supabase
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

export async function getAllCommissions(): Promise<SalesCommission[]> {
  const { data, error } = await supabase
    .from("sales_commissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching commissions:", error);
    return [];
  }
  return data as SalesCommission[];
}

export async function getCommissionById(id: string): Promise<SalesCommission | null> {
  const { data, error } = await supabase.from("sales_commissions").select("*").eq("id", id).single();

  if (error) {
    console.error("Error fetching commission:", error);
    return null;
  }
  return data as SalesCommission;
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
