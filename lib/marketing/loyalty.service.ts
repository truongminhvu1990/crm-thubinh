import * as repo from "./loyalty.repository";
import { MarketingLoyaltyRule, LoyaltyTransactionFilters, CustomerLoyaltyBalance } from "@/types/marketingAutomation";
import { logActivity } from "@/lib/activityLog.service";

// Business logic / composition only - loyalty.repository.ts owns every
// direct Supabase call. Package 3/7.

export async function getRulesPage(page: number, statusFilter?: "Active" | "Inactive" | "All") {
  return repo.findRulesPage(page, statusFilter);
}

export async function getRuleById(id: string) {
  return repo.findRuleById(id);
}

export async function getActiveRulesForPicker() {
  return repo.findActiveRulesForPicker();
}

export async function createRule(
  input: { name: string; description?: string | null; pointsValue: number; createdBy: string | null }
): Promise<MarketingLoyaltyRule | null> {
  const rule = await repo.createRule({
    name: input.name,
    description: input.description ?? null,
    points_value: input.pointsValue,
    status: "Active",
    created_by: input.createdBy,
  });
  if (rule?.id) {
    await logActivity({ staff_id: input.createdBy, action: "Loyalty Updated", entity: "marketing_loyalty_rule", entity_id: rule.id });
  }
  return rule;
}

export async function updateRule(
  id: string,
  input: { name: string; description?: string | null; pointsValue: number },
  staffId: string | null
): Promise<MarketingLoyaltyRule | null> {
  const rule = await repo.updateRule(id, { name: input.name, description: input.description ?? null, points_value: input.pointsValue });
  if (rule) {
    await logActivity({ staff_id: staffId, action: "Loyalty Updated", entity: "marketing_loyalty_rule", entity_id: id });
  }
  return rule;
}

export async function setRuleStatus(id: string, status: "Active" | "Inactive", staffId: string | null): Promise<MarketingLoyaltyRule | null> {
  const rule = await repo.updateRule(id, { status });
  if (rule) {
    await logActivity({ staff_id: staffId, action: "Loyalty Updated", entity: "marketing_loyalty_rule", entity_id: id });
  }
  return rule;
}

// ============================================================
// Point History / Balance
// ============================================================

export async function getTransactionsPage(filters: LoyaltyTransactionFilters) {
  return repo.findTransactionsPage(filters);
}

export async function getCustomerBalance(customerId: string): Promise<CustomerLoyaltyBalance> {
  const [balance, earnedTotal, adjustedTotal, expiredTotal] = await Promise.all([
    repo.sumPointsForCustomer(customerId),
    repo.sumPointsForCustomer(customerId, "Earn"),
    repo.sumPointsForCustomer(customerId, "Adjust"),
    repo.sumPointsForCustomer(customerId, "Expire"),
  ]);
  return { balance, earnedTotal, adjustedTotal, expiredTotal };
}

export async function searchCustomersForBalance(search: string) {
  return repo.searchCustomersForBalance(search);
}

/** The only write path this sprint - a manual transaction-entry form (no
 * automatic point calculation, Spec Rev.2 decision #8). */
export async function recordTransaction(input: {
  customerId: string;
  ruleId?: string | null;
  transactionType: "Earn" | "Adjust" | "Expire";
  points: number;
  note?: string | null;
  createdBy: string | null;
}) {
  const transaction = await repo.createTransaction({
    customer_id: input.customerId,
    rule_id: input.ruleId ?? null,
    transaction_type: input.transactionType,
    points: input.points,
    note: input.note ?? null,
    created_by: input.createdBy,
  });
  if (transaction?.id) {
    await logActivity({ staff_id: input.createdBy, action: "Loyalty Points Granted", entity: "marketing_loyalty_transaction", entity_id: transaction.id });
  }
  return transaction;
}
