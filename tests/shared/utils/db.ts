import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../../lib/supabase/admin";
import { Customer } from "../../../types/customer";
import { Product } from "../../../types/product";
import { Order, OrderItem, OrderPayment } from "../../../types/order";
import { CustomerPurchase } from "../../../types/purchase";
import { SalesCommission } from "../../../types/commission";
import { qaCustomerCode, qaCustomerName, qaCustomerPhone, qaProductCode, qaProductName } from "./testData";

/**
 * Direct Postgres access for test assertions and cleanup, bypassing RLS via
 * the service_role key (reuses lib/supabase/admin.ts - the same client the
 * app itself uses for Auth Admin operations). playwright.config.ts loads
 * .env.local as a fallback specifically so SUPABASE_SERVICE_ROLE_KEY is
 * available here without duplicating it into .env.test.
 *
 * QA Wave 1 rule: "Never trust only the UI" - every Create/Edit/Delete
 * scenario confirms the row itself, not just what the page rendered.
 */
let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!cachedClient) cachedClient = createAdminClient();
  return cachedClient;
}

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const { data, error } = await db().from("customers").select("*").eq("phone", phone).maybeSingle();
  if (error) throw error;
  return data as Customer | null;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await db().from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Customer | null;
}

export async function patchCustomer(id: string, patch: Partial<Customer>): Promise<void> {
  const { error } = await db().from("customers").update(patch).eq("id", id);
  if (error) throw error;
}

/** Safe to call even if the row is already gone (deletes zero rows, no error). */
export async function deleteCustomerRow(id: string): Promise<void> {
  await db().from("customers").delete().eq("id", id);
}

export async function getProductByCode(productCode: string): Promise<Product | null> {
  const { data, error } = await db().from("products").select("*").eq("product_code", productCode).maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await db().from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

/** Safe to call even if the row is already gone (deletes zero rows, no error). */
export async function deleteProductRow(id: string): Promise<void> {
  await db().from("products").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// QA Wave 2 (Orders) additions below.
// ---------------------------------------------------------------------------

/**
 * Precondition fixture, not the thing under test - Customer/Product
 * creation is Wave 1's job (tests/customers, tests/products), already
 * covered there. Orders tests need a real customer/product to attach an
 * order to; creating them directly via the DB (same admin client every
 * other helper in this file already uses) keeps Orders tests isolated
 * from Customer/Product's own UI flows, and fast - no unrelated failure
 * surface. `customer_code` has no DB default (NOT NULL/UNIQUE, confirmed
 * live in Development), so it's always supplied here explicitly.
 */
export async function createTestCustomer(overrides: Partial<Customer> = {}): Promise<Customer> {
  const payload: Partial<Customer> = {
    customer_code: qaCustomerCode(),
    full_name: qaCustomerName(),
    phone: qaCustomerPhone(),
    ...overrides,
  };
  const { data, error } = await db().from("customers").insert(payload).select().single();
  if (error) throw error;
  return data as Customer;
}

/**
 * `status` defaults to 'Active' at the DB level (confirmed live), which is
 * also the only status Orders' product search filters on - no need to set
 * it explicitly, but cost_price/sale_price are set here so every Orders
 * test has deterministic, known values to assert Total/Discount/Profit
 * calculations against.
 */
export async function createTestProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const payload: Partial<Product> = {
    product_code: qaProductCode(),
    product_name: qaProductName(),
    cost_price: 600_000,
    sale_price: 1_000_000,
    ...overrides,
  };
  const { data, error } = await db().from("products").insert(payload).select().single();
  if (error) throw error;
  return data as Product;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await db().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Order | null;
}

export async function getOrdersByCustomerId(customerId: string): Promise<Order[]> {
  const { data, error } = await db().from("orders").select("*").eq("customer_id", customerId);
  if (error) throw error;
  return (data || []) as Order[];
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const { data, error } = await db().from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
  if (error) throw error;
  return data as Order | null;
}

export async function getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await db().from("order_items").select("*").eq("order_id", orderId);
  if (error) throw error;
  return (data || []) as OrderItem[];
}

export async function getPaymentsByOrderId(orderId: string): Promise<OrderPayment[]> {
  const { data, error } = await db().from("payments").select("*").eq("order_id", orderId);
  if (error) throw error;
  return (data || []) as OrderPayment[];
}

export async function getCustomerPurchaseByOrderItemId(orderItemId: string): Promise<CustomerPurchase | null> {
  const { data, error } = await db().from("customer_purchases").select("*").eq("order_item_id", orderItemId).maybeSingle();
  if (error) throw error;
  return data as CustomerPurchase | null;
}

export async function getSalesCommissionByPurchaseId(purchaseId: string): Promise<SalesCommission | null> {
  const { data, error } = await db().from("sales_commissions").select("*").eq("purchase_id", purchaseId).maybeSingle();
  if (error) throw error;
  return data as SalesCommission | null;
}

/**
 * Deletes an order and every row that transitively depends on it,
 * regardless of the order's status (bypasses the app's own Draft+Unpaid-
 * only deleteOrder() restriction entirely - this is test cleanup via the
 * admin client, not the application's delete workflow under test).
 *
 * Deletion order matters: `customer_purchases.order_item_id` REFERENCES
 * `order_items(id)` with no ON DELETE CASCADE (confirmed in
 * 20260802_orders_sales_snapshot_integration.sql's own header comment -
 * deliberate, since order_items on a Completed order can never be edited
 * or deleted through the app), and `sales_commissions.purchase_id` has no
 * FK at all (deliberately, see 20260721_sales_commission_module.sql).
 * Both must be deleted manually, before the order itself, or a completed
 * order's DELETE would fail with a foreign key violation.
 * `orders.id -> order_items/payments/order_events` (ON DELETE CASCADE) is
 * the one part of this cleanup Postgres already does for free.
 *
 * Safe to call even if the order is already gone or was never completed
 * (every step deletes zero rows, no error, when there's nothing to find).
 */
export async function deleteOrderRow(id: string): Promise<void> {
  const { data: items } = await db().from("order_items").select("id").eq("order_id", id);
  const itemIds = (items || []).map((i) => i.id as string);

  if (itemIds.length > 0) {
    const { data: purchases } = await db().from("customer_purchases").select("id").in("order_item_id", itemIds);
    const purchaseIds = (purchases || []).map((p) => p.id as string);

    if (purchaseIds.length > 0) {
      await db().from("sales_commissions").delete().in("purchase_id", purchaseIds);
      await db().from("customer_purchases").delete().in("id", purchaseIds);
    }
  }

  await db().from("orders").delete().eq("id", id);
}
