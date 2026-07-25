/**
 * Backfill historical Completed Orders into customer_purchases and
 * sales_commissions.
 *
 * Any order that reached order_status = 'Completed' BEFORE
 * 20260802_orders_sales_snapshot_integration.sql shipped never went
 * through complete_order_with_snapshots, so its order_items have no
 * matching customer_purchases/sales_commissions rows.
 *
 * Reuse, not reimplementation:
 *   - getOrderList()              lib/orders/order.service.ts   (read)
 *   - findOrderItemsByOrderId()   lib/orders/order.repository.ts (read)
 *   - getStaffByName()            lib/staff.service.ts          (read)
 *   - getActiveCommissionRules()  lib/commission/commission.repository.ts
 *   - findMatchingRule()          lib/commission/commission.service.ts
 *   - calculateCommissionAmount() lib/commission/commission.service.ts
 * These are the exact same functions order.service.ts#completeOrder() calls
 * before invoking complete_order_with_snapshots — no matching or
 * calculation logic is re-derived here. This script computes every field,
 * then hands already-computed rows to the backfill_completed_order() RPC,
 * which writes them and nothing else — no commission math happens in SQL.
 *
 * Write path (revised): all writes now go through the backfill_completed_order()
 * Postgres RPC (see the accompanying RPC SQL) instead of this script
 * inserting into customer_purchases/sales_commissions directly. That
 * function wraps both inserts for an entire order in one real database
 * transaction — if anything fails, everything for that order rolls back —
 * which a Supabase JS client calling two separate REST inserts could never
 * guarantee on its own. complete_order_with_snapshots() itself still can't
 * be reused directly: its own guard (`WHERE order_status IN ('Draft',
 * 'Reserved')`) always rejects an order that's already Completed, which is
 * exactly what every order this script processes already is.
 *
 * Usage (see package.json's "backfill:orders" script):
 *   npm run backfill:orders -- --dry-run
 *   npm run backfill:orders -- --execute
 * (npm requires the `--` separator to forward flags to the script itself —
 * without it, npm swallows them.) No flag defaults to --dry-run (the safe,
 * read-only choice) rather than silently writing. --dry-run never calls
 * the RPC (it writes) — it previews by reading current customer_purchases/
 * sales_commissions state and predicting what the RPC would do.
 * --execute requires typing "YES" at an interactive confirmation prompt
 * before anything is written.
 */

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getOrderList } from "@/lib/orders/order.service";
import * as orderRepository from "@/lib/orders/order.repository";
import { getStaffByName } from "@/lib/staff.service";
import { getActiveCommissionRules } from "@/lib/commission/commission.repository";
import { findMatchingRule, calculateCommissionAmount } from "@/lib/commission/commission.service";
import { supabase } from "@/lib/supabase";
import type { OrderItem } from "@/types/order";
import type { CommissionRule } from "@/types/commission";

type Mode = "dry-run" | "execute";

interface Totals {
  completedOrdersFound: number;
  alreadyBackfilled: number;
  ordersBackfilled: number;
  purchasesCreated: number;
  commissionsCreated: number;
  skipped: number;
  errors: number;
}

/** p_purchase_rows element — same shape complete_order_with_snapshots takes
 * (see order.repository.ts's PurchaseSnapshotInput), passed to
 * backfill_completed_order() unchanged. */
interface PurchaseRow {
  id: string;
  customer_id: string;
  product_id: string;
  sale_price: number;
  sale_date: string;
  source: string | null;
  salesperson: string | null;
  salesperson_id: string | null;
  order_item_id: string;
}

/** p_commission_rows element. Carries `order_item_id`, not a guessed
 * `purchase_id` — see the RPC SQL's comment on why: under backfill, a
 * purchase for a given order_item may already exist from an earlier
 * partial run, with an id this script can't know in advance, so the RPC
 * resolves the real purchase_id itself by joining on order_item_id. */
interface CommissionRow {
  id: string;
  order_item_id: string;
  customer_id: string;
  salesperson: string | null;
  salesperson_id: string | null;
  sale_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: "Pending";
}

interface BackfillResult {
  purchases_created: number;
  commissions_created: number;
  skipped: number;
}

function parseMode(argv: string[]): { mode: Mode; explicit: boolean } {
  const hasDryRun = argv.includes("--dry-run");
  const hasExecute = argv.includes("--execute");

  if (hasDryRun && hasExecute) {
    throw new Error("Pass exactly one of --dry-run or --execute, not both.");
  }
  if (hasExecute) return { mode: "execute", explicit: true };
  if (hasDryRun) return { mode: "dry-run", explicit: true };
  return { mode: "dry-run", explicit: false };
}

/** full_name -> staff.id | null, resolved once per distinct sales_owner via
 * the real getStaffByName() (exact-match, same as order.service.ts#completeOrder()). */
const staffIdCache = new Map<string, string | null>();

async function resolveSalespersonId(fullName: string): Promise<string | null> {
  if (staffIdCache.has(fullName)) return staffIdCache.get(fullName)!;
  const staff = await getStaffByName(fullName);
  const id = staff?.id ?? null;
  staffIdCache.set(fullName, id);
  return id;
}

/** Required before any --execute write. Aborts on anything other than an
 * exact "YES" (empty input, "y", "yes", Ctrl+D/EOF all abort — safe default). */
async function confirmExecute(): Promise<boolean> {
  console.log("\nWARNING:");
  console.log("This will modify Production.");
  const rl = readline.createInterface({ input: stdin, output: stdout });
  let answer: string;
  try {
    answer = await rl.question("Type YES to continue: ");
  } finally {
    rl.close();
  }
  return answer === "YES";
}

/** --dry-run only: the RPC writes, so it's never called in preview mode.
 * This reads current customer_purchases/sales_commissions state to predict
 * exactly what backfill_completed_order() would report, without writing
 * anything. */
async function predictOutcome(
  items: OrderItem[],
  purchaseRows: PurchaseRow[]
): Promise<BackfillResult> {
  const itemIds = items.map((item) => item.id!);

  const { data: existingPurchaseRows, error: purchaseLookupError } = await supabase
    .from("customer_purchases")
    .select("id, order_item_id")
    .in("order_item_id", itemIds);

  if (purchaseLookupError) {
    throw new Error(`customer_purchases lookup failed: ${purchaseLookupError.message}`);
  }

  const purchaseIdByItemId = new Map<string, string>(
    (existingPurchaseRows ?? []).map((row) => [row.order_item_id as string, row.id as string])
  );
  const existingPurchaseIds = [...purchaseIdByItemId.values()];

  const { data: existingCommissionRows, error: commissionLookupError } =
    existingPurchaseIds.length > 0
      ? await supabase.from("sales_commissions").select("purchase_id").in("purchase_id", existingPurchaseIds)
      : { data: [] as { purchase_id: string }[], error: null };

  if (commissionLookupError) {
    throw new Error(`sales_commissions lookup failed: ${commissionLookupError.message}`);
  }

  const purchaseIdsWithCommission = new Set((existingCommissionRows ?? []).map((row) => row.purchase_id));

  let purchases_created = 0;
  let commissions_created = 0;
  let skipped = 0;

  for (const row of purchaseRows) {
    const existingPurchaseId = purchaseIdByItemId.get(row.order_item_id);
    const purchaseAlreadyExists = existingPurchaseId !== undefined;
    const commissionAlreadyExists = existingPurchaseId ? purchaseIdsWithCommission.has(existingPurchaseId) : false;

    if (!purchaseAlreadyExists) purchases_created += 1;
    if (!commissionAlreadyExists) commissions_created += 1;
    if (purchaseAlreadyExists && commissionAlreadyExists) skipped += 1;
  }

  return { purchases_created, commissions_created, skipped };
}

async function main() {
  const { mode, explicit } = parseMode(process.argv.slice(2));
  const dryRun = mode === "dry-run";

  console.log(`Backfill Orders — mode: ${mode.toUpperCase()}${!explicit ? " (no flag given, defaulting to dry-run)" : ""}`);
  if (dryRun) console.log("No rows will be written. Re-run with --execute to apply.\n");

  if (!dryRun) {
    const confirmed = await confirmExecute();
    if (!confirmed) {
      console.log("Aborted — confirmation not received. No rows were written.");
      process.exitCode = 1;
      return;
    }
  }

  const totals: Totals = {
    completedOrdersFound: 0,
    alreadyBackfilled: 0,
    ordersBackfilled: 0,
    purchasesCreated: 0,
    commissionsCreated: 0,
    skipped: 0,
    errors: 0,
  };

  // getOrderList() — existing read service (order.service.ts). No dedicated
  // "orders by status" read exists, so this filters client-side, the same
  // convention getOrderList's own getCustomerOrderHistory() neighbor uses.
  const allOrders = await getOrderList();
  const completedOrders = allOrders.filter((order) => order.order_status === "Completed");
  totals.completedOrdersFound = completedOrders.length;

  // getActiveCommissionRules() — fetched once, reused for every order, same
  // rule set order.service.ts#completeOrder() matches every line against.
  const commissionRules: CommissionRule[] = await getActiveCommissionRules();

  for (const order of completedOrders) {
    try {
      const items: OrderItem[] = await orderRepository.findOrderItemsByOrderId(order.id!);

      if (items.length === 0) {
        totals.skipped += 1;
        console.log(`SKIP    ${order.order_number} — Completed order has no order_items`);
        continue;
      }

      const salespersonId = await resolveSalespersonId(order.sales_owner);

      const purchaseRows: PurchaseRow[] = [];
      const commissionRows: CommissionRow[] = [];

      for (const item of items) {
        // findMatchingRule() — reused unchanged, including its
        // highest-minimum-bracket tie-break (Business Rule 4).
        const rule = findMatchingRule(commissionRules, item.line_total);
        if (!rule) {
          totals.errors += 1;
          console.error(
            `ERROR   ${order.order_number} / item ${item.id} — no active commission rule matches sale amount ${item.line_total}; excluded from this order's backfill call`
          );
          continue;
        }

        // calculateCommissionAmount() — reused unchanged.
        const commissionAmount = calculateCommissionAmount(item.line_total, rule.commission_percent);

        purchaseRows.push({
          id: crypto.randomUUID(),
          customer_id: order.customer_id,
          product_id: item.product_id,
          sale_price: item.line_total,
          sale_date: order.order_date,
          source: null,
          salesperson: order.sales_owner,
          salesperson_id: salespersonId,
          order_item_id: item.id!,
        });
        commissionRows.push({
          id: crypto.randomUUID(),
          order_item_id: item.id!,
          customer_id: order.customer_id,
          salesperson: order.sales_owner,
          salesperson_id: salespersonId,
          sale_amount: item.line_total,
          commission_percent: rule.commission_percent,
          commission_amount: commissionAmount,
          status: "Pending",
        });
      }

      if (purchaseRows.length === 0) {
        // Every item on this order failed rule-matching above — already
        // reported as errors, nothing left to send.
        continue;
      }

      let result: BackfillResult;

      if (dryRun) {
        result = await predictOutcome(items, purchaseRows);
        console.log(
          `[DRY-RUN] ${order.order_number} — would call backfill_completed_order: purchases_created=${result.purchases_created}, commissions_created=${result.commissions_created}, skipped=${result.skipped}`
        );
      } else {
        // The one write for this order: backfill_completed_order() inserts
        // the purchase + commission for every item in one real transaction
        // and reports back exactly what it did.
        const { data, error } = await supabase.rpc("backfill_completed_order", {
          p_order_id: order.id,
          p_purchase_rows: purchaseRows,
          p_commission_rows: commissionRows,
        });

        if (error) {
          totals.errors += 1;
          console.error(`ERROR   ${order.order_number} — backfill_completed_order failed: ${error.message}`);
          continue;
        }

        result = data as BackfillResult;
        console.log(
          `CREATE  ${order.order_number} — purchases_created=${result.purchases_created}, commissions_created=${result.commissions_created}, skipped=${result.skipped}`
        );
      }

      totals.purchasesCreated += result.purchases_created;
      totals.commissionsCreated += result.commissions_created;

      if (result.purchases_created > 0 || result.commissions_created > 0) {
        totals.ordersBackfilled += 1;
      } else {
        totals.alreadyBackfilled += 1;
      }
    } catch (err) {
      totals.errors += 1;
      console.error(`ERROR   ${order.order_number} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Mode:                    ${mode.toUpperCase()}`);
  console.log(`Completed Orders found:  ${totals.completedOrdersFound}`);
  console.log(`Already Backfilled:      ${totals.alreadyBackfilled}`);
  console.log(`Orders Backfilled:       ${totals.ordersBackfilled}`);
  console.log(`Purchases Created:       ${totals.purchasesCreated}`);
  console.log(`Commissions Created:     ${totals.commissionsCreated}`);
  console.log(`Skipped:                 ${totals.skipped}`);
  console.log(`Errors:                  ${totals.errors}`);
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("\nDry run only — no rows were written. Re-run with --execute to apply.");
  }

  process.exitCode = totals.errors > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
