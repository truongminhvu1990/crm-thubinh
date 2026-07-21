import { supabase } from "@/lib/supabase";
import { MARKETING_PAGE_SIZE } from "./marketing.constants";
import {
  MarketingLoyaltyRule,
  MarketingLoyaltyTransaction,
  LoyaltyTransactionFilters,
  LoyaltyTransactionPage,
  LoyaltyRuleStatus,
} from "@/types/marketingAutomation";

// Raw Supabase access only - Package 7, Loyalty Foundation (Rule/Balance/
// Point History only, no automatic point calculation, Spec Rev.2 decision #8).

export async function findRulesPage(page: number, statusFilter?: LoyaltyRuleStatus | "All"): Promise<{ rows: MarketingLoyaltyRule[]; totalCount: number }> {
  let query = supabase.from("marketing_loyalty_rules").select("*", { count: "exact" });
  if (statusFilter && statusFilter !== "All") {
    query = query.eq("status", statusFilter);
  }
  query = query.order("created_at", { ascending: false });

  const from = (page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching loyalty rules page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingLoyaltyRule[]) || [], totalCount: count ?? 0 };
}

export async function findRuleById(id: string): Promise<MarketingLoyaltyRule | null> {
  const { data, error } = await supabase.from("marketing_loyalty_rules").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching loyalty rule:", error);
    return null;
  }
  return data as MarketingLoyaltyRule | null;
}

export async function findActiveRulesForPicker(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("marketing_loyalty_rules").select("id, name").eq("status", "Active").order("name");
  if (error) {
    console.error("Error fetching active loyalty rules:", error);
    return [];
  }
  return data as { id: string; name: string }[];
}

export async function createRule(
  rule: Omit<MarketingLoyaltyRule, "id" | "created_at" | "updated_at">
): Promise<MarketingLoyaltyRule | null> {
  const { data, error } = await supabase.from("marketing_loyalty_rules").insert(rule).select().single();
  if (error) {
    console.error("Error creating loyalty rule:", error);
    return null;
  }
  return data as MarketingLoyaltyRule;
}

export async function updateRule(
  id: string,
  fields: Partial<Pick<MarketingLoyaltyRule, "name" | "description" | "points_value" | "status">>
): Promise<MarketingLoyaltyRule | null> {
  const { data, error } = await supabase.from("marketing_loyalty_rules").update(fields).eq("id", id).select().single();
  if (error) {
    console.error("Error updating loyalty rule:", error);
    return null;
  }
  return data as MarketingLoyaltyRule;
}

// ============================================================
// Loyalty Transactions (Point History ledger)
// ============================================================

export async function findTransactionsPage(filters: LoyaltyTransactionFilters): Promise<LoyaltyTransactionPage> {
  let query = supabase
    .from("marketing_loyalty_transactions")
    .select("*, customer:customers(id, full_name, customer_code), rule:marketing_loyalty_rules(id, name)", { count: "exact" });

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }
  if (filters.transactionType && filters.transactionType !== "All") {
    query = query.eq("transaction_type", filters.transactionType);
  }

  query = query.order("created_at", { ascending: false });

  const from = (filters.page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching loyalty transactions page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingLoyaltyTransaction[]) || [], totalCount: count ?? 0 };
}

export async function createTransaction(
  transaction: Omit<MarketingLoyaltyTransaction, "id" | "created_at" | "customer" | "rule">
): Promise<MarketingLoyaltyTransaction | null> {
  const { data, error } = await supabase.from("marketing_loyalty_transactions").insert(transaction).select().single();
  if (error) {
    console.error("Error creating loyalty transaction:", error);
    return null;
  }
  return data as MarketingLoyaltyTransaction;
}

/** Balance is always SUM(points), never stored (DATABASE.md §2.5). */
export async function sumPointsForCustomer(customerId: string, transactionType?: "Earn" | "Adjust" | "Expire"): Promise<number> {
  let query = supabase.from("marketing_loyalty_transactions").select("points").eq("customer_id", customerId);
  if (transactionType) query = query.eq("transaction_type", transactionType);
  const { data, error } = await query;
  if (error) {
    console.error("Error summing loyalty points for customer:", error);
    return 0;
  }
  return (data || []).reduce((sum, r) => sum + r.points, 0);
}

export async function searchCustomersForBalance(search: string): Promise<{ id: string; full_name: string; customer_code: string }[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, customer_code")
    .or(`full_name.ilike.%${search.replace(/[%,]/g, "")}%,customer_code.ilike.%${search.replace(/[%,]/g, "")}%`)
    .limit(10);
  if (error) {
    console.error("Error searching customers for loyalty balance:", error);
    return [];
  }
  return data as { id: string; full_name: string; customer_code: string }[];
}
